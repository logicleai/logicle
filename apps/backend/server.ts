import { createServer } from 'node:http'
import { parse } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

const dev = process.env.NODE_ENV !== 'production'
const apiOnly = process.env.API_ONLY === 'true'
const projectRoot = process.cwd()
const frontendRoot = path.join(projectRoot, 'apps', 'frontend')
const frontendOutDir = path.join(frontendRoot, 'out')

const loadProcessEnv = () => {
  const mode = process.env.NODE_ENV ?? 'development'
  const envFiles = [
    `.env.${mode}.local`,
    mode === 'test' ? null : '.env.local',
    `.env.${mode}`,
    '.env',
  ].filter((value): value is string => value !== null)

  for (const file of envFiles) {
    const filePath = path.resolve(process.cwd(), file)
    if (existsSync(filePath)) process.loadEnvFile(filePath)
  }
}

loadProcessEnv()

// Dynamic imports so that DATABASE_URL (and other env vars loaded above) are
// already set when these modules — and their transitive deps like database.ts
// which uses top-level await — are first evaluated.
const { handleApiRequest } = await import('@/lib/router')
const { bootstrapBackendRuntime } = await import('@/lib/bootstrap')
const { attachSatelliteServer, SATELLITE_RPC_PATH } = await import('@/lib/satellite/server')
const { serveStaticFrontend } = await import('@/lib/staticFrontend')

const port = process.env.PORT || 3000

// In dev, keep using Next's own dev server (HMR, on-demand compilation).
// In production, apps/frontend is built with `output: 'export'` (see
// next.config.ts) — a fully static build with no server runtime — so
// serveStaticFrontend takes over instead of Next's request handler. This
// also means the `standalone`/file-tracing machinery this hack used to
// paper over is gone entirely; there's no Next server process to trace.
//
// The `next` package (and its ~380MB of platform SWC compiler binaries) is
// only ever needed for this dev-mode branch — importing it dynamically,
// gated on `dev`, keeps it out of module resolution in production entirely,
// so the runtime Docker image can safely omit it from node_modules.
const nextApp = apiOnly || !dev ? null : (await import('next')).default({ dev, dir: frontendRoot })
const handle = nextApp?.getRequestHandler() ?? null

async function main() {
  await bootstrapBackendRuntime()

  if (nextApp) {
    await nextApp.prepare()
  }

  const server = createServer(async (req, res) => {
    try {
      const pathname = parse(req.url || '/', true).pathname
      if (pathname?.startsWith('/api/')) {
        const handled = await handleApiRequest(req, res)
        if (handled) {
          return
        }
        // No registered route matched. Respond here rather than falling
        // through to the frontend handlers below — otherwise an unmatched
        // /api/* path (typo, removed endpoint, ...) would be treated as a
        // page navigation and get the auth-gate's redirect-to-login instead
        // of the JSON 404 an API caller actually needs.
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Not found', values: {} } }))
        return
      }

      if (apiOnly) {
        res.writeHead(404).end()
        return
      }

      if (handle) {
        const parsedUrl = parse(req.url || '/', true)
        await handle(req, res, parsedUrl)
        return
      }

      const handled = await serveStaticFrontend(req, res, frontendOutDir)
      if (!handled) {
        res.writeHead(404).end()
      }
    } catch (err) {
      console.error('Unhandled HTTP request error:', err)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })

  attachSatelliteServer(server)

  if (nextApp && typeof nextApp.getUpgradeHandler === 'function') {
    const nextUpgradeHandler = nextApp.getUpgradeHandler.bind(nextApp)()
    server.on('upgrade', (req, socket, head) => {
      const { pathname } = parse(req.url || '/', true)
      if (pathname === '/_next/webpack-hmr') {
        nextUpgradeHandler(req, socket, head)
      }
    })
  }

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
    if (apiOnly) console.log('> Running in API-only mode (no Next.js)')
    console.log(`> Satellite WebSocket: ws://localhost:${port}${SATELLITE_RPC_PATH}`)
  })
}

main().catch((err) => {
  console.error('Fatal error starting server:', err)
  process.exit(1)
})

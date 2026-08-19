import { createServer } from 'node:http'
import { parse } from 'node:url'
import { existsSync } from 'node:fs'
import * as fs from 'node:fs'
import path from 'node:path'

const dev = process.env.NODE_ENV !== 'production'
const apiOnly = process.env.API_ONLY === 'true'
const projectRoot = process.cwd()
const frontendViteRoot = path.join(projectRoot, 'apps', 'frontend-vite')
const frontendViteOutDir = path.join(frontendViteRoot, 'dist')

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
const { serveStaticFrontendVite, applyAuthGate, injectBootstrapData } = await import(
  '@/lib/staticFrontendVite'
)

const port = process.env.PORT || 3000

// In dev, Vite's own dev server (HMR, on-demand transform) is embedded via
// middlewareMode into this same http server. In production, apps/frontend-vite
// is built with `vite build` — a fully static SPA build with no server
// runtime — so serveStaticFrontendVite takes over instead. `vite` itself is
// only ever imported in the dev branch, so the runtime Docker image can
// safely omit it from node_modules in production.
const viteDevServer =
  apiOnly || !dev
    ? null
    : await (
        await import('vite')
      ).createServer({
        root: frontendViteRoot,
        server: { middlewareMode: true },
        appType: 'custom',
      })

async function main() {
  await bootstrapBackendRuntime()

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

      if (viteDevServer) {
        // Let Vite serve/transform its own module graph (/src/*, /@vite/*,
        // /@react-refresh, etc.) first. If nothing in there matched, `next()`
        // fires and we fall through to rendering the (transformed) HTML
        // shell below — the dev-mode analogue of serveStaticFrontendVite's
        // prod path, just built from Vite's live template instead of a
        // `vite build` output file.
        let fellThrough = false
        await new Promise<void>((resolve) => {
          viteDevServer.middlewares(req, res, () => {
            fellThrough = true
            resolve()
          })
          res.once('finish', resolve)
        })
        if (!fellThrough) return

        if (pathname === '/') {
          res.writeHead(307, { Location: '/chat' }).end()
          return
        }
        if (await applyAuthGate(req, res)) return

        const template = await fs.promises.readFile(
          path.join(frontendViteRoot, 'index.html'),
          'utf-8'
        )
        const transformed = await viteDevServer.transformIndexHtml(req.url || '/', template)
        const withBootstrap = await injectBootstrapData(transformed)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(withBootstrap)
        return
      }

      const handled = await serveStaticFrontendVite(req, res, frontendViteOutDir)
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

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
    if (apiOnly) console.log('> Running in API-only mode (no frontend)')
    console.log(`> Satellite WebSocket: ws://localhost:${port}${SATELLITE_RPC_PATH}`)
  })
}

main().catch((err) => {
  console.error('Fatal error starting server:', err)
  process.exit(1)
})

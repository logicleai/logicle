import { createServer } from 'node:http'
import next from 'next'
import { parse } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const dev = process.env.NODE_ENV !== 'production'
const apiOnly = process.env.API_ONLY === 'true'
const projectRoot = process.cwd()
const frontendRoot = path.join(projectRoot, 'apps', 'frontend')

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
const { handleApiRequest } = await import('@/lib/backend/router')
const { bootstrapBackendRuntime } = await import('@/lib/backend/bootstrap')
const { attachSatelliteServer, SATELLITE_RPC_PATH } = await import('@/lib/backend/satellite')

if (!dev) {
  // This is necessary to make standalone work. Very hacky....
  // Got it from:
  // https://github.com/oldium/microsoft-smtp-oauth2-proxy/blob/master/server/server.ts
  const nextConfig = readFileSync(path.join(frontendRoot, '.next', 'required-server-files.json')).toString('utf-8')
  const nextConfigJson = JSON.parse(nextConfig)
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfigJson.config)
}

const port = process.env.PORT || 3000

const nextApp = apiOnly ? null : next({ dev, dir: frontendRoot })
const handle = nextApp?.getRequestHandler() ?? null

async function main() {
  await bootstrapBackendRuntime()

  if (nextApp) {
    await nextApp.prepare()
  }

  const server = createServer(async (req, res) => {
    const pathname = parse(req.url || '/', true).pathname
    if (pathname?.startsWith('/api/')) {
      const handled = await handleApiRequest(req, res)
      if (handled) {
        return
      }
    }

    if (handle) {
      const parsedUrl = parse(req.url || '/', true)
      await handle(req, res, parsedUrl)
    } else {
      res.writeHead(404).end()
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

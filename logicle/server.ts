import { createServer } from 'node:http'
import next from 'next'
import { parse } from 'node:url'
import { WebSocketServer } from 'ws'
import { handleSatelliteConnection } from './lib/satelliteHub' // compiled TS output OR use ts-node
import { setRuntime } from '@logicle/file-analyzer'
import { WorkerRuntime } from '@logicle/file-analyzer/worker'
import { initializeTelemetryFromProcessEnv } from './lib/bootstrap/telemetry'
import { getLogger, initializeLogger } from './lib/logging'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { handleApiRequest } from './lib/backend/router'

const dev = process.env.NODE_ENV !== 'production'

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

if (!dev) {
  // This is necessary to make standalone work. Very hacky....
  // Got it from:
  // https://github.com/oldium/microsoft-smtp-oauth2-proxy/blob/master/server/server.ts
  const nextConfig = readFileSync('./.next/required-server-files.json').toString('utf-8')
  const nextConfigJson = JSON.parse(nextConfig)
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfigJson.config)
}

const port = process.env.PORT || 3000

const nextApp = next({ dev })
const handle = nextApp.getRequestHandler()
const getUpgradeHandler =
  typeof nextApp.getUpgradeHandler === 'function' ? nextApp.getUpgradeHandler.bind(nextApp) : null

async function main() {
  const telemetryInitialized = await initializeTelemetryFromProcessEnv()
  if (telemetryInitialized) {
    console.log(`Initialized opentelemetry endpoint ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`)
  }
  initializeLogger()
  setRuntime(new WorkerRuntime(getLogger()))

  await nextApp.prepare()

  const server = createServer(async (req, res) => {
    const pathname = parse(req.url || '/', true).pathname
    if (pathname?.startsWith('/api/')) {
      const handled = await handleApiRequest(req, res)
      if (handled) {
        return
      }
    }

    const parsedUrl = parse(req.url || '/', true)
    await handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', async (ws, req) => {
    await handleSatelliteConnection(ws, req)
  })

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '/', true)

    if (pathname === '/_next/webpack-hmr' && getUpgradeHandler) {
      return getUpgradeHandler()(req, socket, head)
    }

    if (pathname === '/api/rpc') {
      return wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    }

    socket.destroy()
  })

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
    console.log(`> Satellite WebSocket: ws://localhost:${port}/api/rpc`)
  })
}

main().catch((err) => {
  console.error('Fatal error starting server:', err)
  process.exit(1)
})

import { createServer } from 'node:http'
import next from 'next'
import { parse } from 'node:url'
import { WebSocketServer } from 'ws'
import { handleSatelliteConnection } from './lib/satelliteHub' // compiled TS output OR use ts-node
import { readFileSync } from 'node:fs'

const dev = process.env.NODE_ENV !== 'production'

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
  await nextApp.prepare()

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true)
    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws, req) => {
    handleSatelliteConnection(ws, req)
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

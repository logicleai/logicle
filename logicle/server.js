import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleSidecarMessage, handleSidecarClose } from './lib/sidecarHub.js' // compiled TS output OR use ts-node

const dev = process.env.NODE_ENV !== 'production'
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
    console.log('[WS] New sidecar connection')
    ws.on('message', (data) => handleSidecarMessage(ws, data))
    ws.on('close', () => handleSidecarClose(ws))
    ws.on('error', (err) => console.error('[WS] error:', err))
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
    console.log(`> Sidecar WebSocket: ws://localhost:${port}/api/rpc`)
  })
}

main().catch((err) => {
  console.error('Fatal error starting server:', err)
  process.exit(1)
})

import { WebSocket, WebSocketServer } from 'ws'
import { parse } from 'node:url'
import type { Server } from 'node:http'
import type { Socket } from 'node:net'
import { handleSatelliteConnection } from '@/lib/satellite/hub'

export const SATELLITE_RPC_PATH = '/api/rpc'

export function attachSatelliteServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true })
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      const socket = ws as WebSocket & { isAlive?: boolean }
      if (socket.isAlive === false) {
        socket.terminate()
        continue
      }
      socket.isAlive = false
      socket.ping()
    }
  }, 30000)

  wss.on('connection', async (ws, req) => {
    ;(ws as WebSocket & { isAlive?: boolean }).isAlive = true
    ws.on('pong', () => {
      ;(ws as WebSocket & { isAlive?: boolean }).isAlive = true
    })
    await handleSatelliteConnection(ws, req)
  })

  wss.on('close', () => {
    clearInterval(heartbeatInterval)
  })

  server.on('upgrade', (req, socket: Socket, head) => {
    const { pathname } = parse(req.url || '/', true)

    if (pathname === SATELLITE_RPC_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    }
  })
}

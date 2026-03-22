import { WebSocketServer } from 'ws'
import { parse } from 'node:url'
import type { Server } from 'node:http'
import type { Socket } from 'node:net'
import { handleSatelliteConnection } from '@/lib/satellite/hub'

export const SATELLITE_RPC_PATH = '/api/rpc'

export function attachSatelliteServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', async (ws, req) => {
    await handleSatelliteConnection(ws, req)
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

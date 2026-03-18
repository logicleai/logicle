import { WebSocketServer } from 'ws'
import { parse } from 'node:url'
import type { Server } from 'node:http'
import type { Socket } from 'node:net'
import { handleSatelliteConnection } from '@/lib/satelliteHub'

export const SATELLITE_RPC_PATH = '/api/rpc'

export function attachSatelliteServer(server: Server, getUpgradeHandler: (() => (req: any, socket: any, head: any) => any) | null) {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', async (ws, req) => {
    await handleSatelliteConnection(ws, req)
  })

  server.on('upgrade', (req, socket: Socket, head) => {
    const { pathname } = parse(req.url || '/', true)

    if (pathname === '/_next/webpack-hmr' && getUpgradeHandler) {
      return getUpgradeHandler()(req, socket, head)
    }

    if (pathname === SATELLITE_RPC_PATH) {
      return wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    }

    socket.destroy()
  })
}

import WebSocket from 'ws'
import { CallMessage, Message, Tool } from './satelliteTypes'

export interface SatelliteConnection {
  name: string
  tools: Tool[]
  socket: WebSocket
  pendingCalls: Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (reason?: unknown) => void
    }
  >
}

export type SatelliteHub = {
  connections: Map<string, SatelliteConnection>
  nextCallId: number
}
// ---- Global singleton state on globalThis ----
if (!globalThis.__satellites) {
  globalThis.__satellites = { connections: new Map<string, SatelliteConnection>(), nextCallId: 1 }
}

export const hub = globalThis.__satellites as SatelliteHub
export const connections = hub.connections

export function handleSatelliteConnection(ws: WebSocket) {
  console.log('[WS] New satellite connection')
  ws.on('message', (data) => handleSatelliteMessage(ws, data))
  ws.on('close', () => handleSatelliteClose(ws))
  ws.on('error', (err) => console.error('[WS] error:', err))
}

function handleSatelliteMessage(socket: WebSocket, data: WebSocket.RawData) {
  let conn: SatelliteConnection | undefined
  for (const sc of connections.values()) {
    if (sc.socket === socket) {
      conn = sc
      break
    }
  }

  try {
    const msg = JSON.parse(String(data)) as Message
    if (msg.type === 'register') {
      const { name, tools } = msg
      const newConn = {
        name,
        tools,
        socket,
        pendingCalls: new Map(),
      }
      connections.set(name, newConn)
      console.log(
        `[SatelliteHub] "${name}" registered methods: ${tools.map((t) => t.name).join(', ')}`
      )
      return
    }

    if (msg.type === 'response') {
      if (!conn) return
      const res = msg
      const pending = conn.pendingCalls.get(res.id)
      if (!pending) return
      conn.pendingCalls.delete(res.id)
      if (res.ok) pending.resolve(res.result)
      else pending.reject(new Error(res.error))
      return
    }
    console.warn('[SatelliteHub] Unknown message from satellite:', msg)
  } catch (err) {
    console.error('[SatelliteHub] Failed to parse satellite message:', err)
  }
}

/**
 * Handle closing of a satellite WebSocket.
 */
function handleSatelliteClose(socket: WebSocket) {
  let conn: SatelliteConnection | undefined
  for (const sc of connections.values()) {
    if (sc.socket === socket) {
      conn = sc
      break
    }
  }

  if (!conn) {
    console.error("Can't find disconnecting socket in satellite list")
    return
  }

  connections.delete(conn.name)
  for (const { reject } of conn.pendingCalls.values()) {
    reject(new Error('Satellite disconnected'))
  }
  conn.pendingCalls.clear()
  console.log(`[SatelliteHub] Satellite disconnected: ${conn.name}`)
}

/**
 * Call a method on a named satellite.
 * Used by your Next server code.
 */
export function callSatelliteMethod(
  satelliteName: string,
  method: string,
  params: unknown
): Promise<unknown> {
  const conn = connections.get(satelliteName)
  if (!conn) {
    throw new Error(`Satellite "${satelliteName}" is not connected`)
  }
  const tool = conn.tools.find((t) => t.name === method)
  if (!tool) {
    throw new Error(`Satellite "${satelliteName}" does not expose method "${method}"`)
  }

  const id = String(hub.nextCallId++)
  const msg: CallMessage = { type: 'call', id, method, params }

  return new Promise((resolve, reject) => {
    conn.pendingCalls.set(id, { resolve, reject })

    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(JSON.stringify(msg))
    } else {
      conn.pendingCalls.delete(id)
      reject(new Error('Satellite socket not open'))
    }
  })
}

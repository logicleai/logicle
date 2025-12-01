import WebSocket from 'ws'
import { Message, Tool, ToolCallMessage } from './satelliteTypes'
import { ToolUILink } from './chat/tools'
import { IncomingMessage } from 'http'

export interface SatelliteConnection {
  name: string
  tools: Tool[]
  socket: WebSocket
  pendingCalls: Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (reason?: unknown) => void
      uiLink: ToolUILink
    }
  >
}

export type SatelliteHub = {
  connections: Map<string, SatelliteConnection>
  nextCallId: number
}
// ---- Global singleton state on globalThis ----
if (!globalThis.__satellites) {
  globalThis.__satellites = {
    connections: new Map<string, SatelliteConnection>(),
    nextCallId: 1,
    authenticate: async (apiKey: string) => {
      return false
    },
  }
}

export const hub = globalThis.__satellites as SatelliteHub
export const connections = hub.connections

export async function checkAuthentication(authorization: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api/user/profile`, {
      headers: { Authorization: authorization },
    })
    return res.status == 200
  } catch (e) {
    return false
  }
}

export function handleSatelliteConnection(ws: WebSocket, req: IncomingMessage) {
  checkAuthentication(req.headers.authorization ?? '').then((authenticated) => {
    if (!authenticated) {
      console.log('[WS] Satellite connection rejected: not authenticated')
      ws.close(1008, 'Not authenticated')
      return
    }
    console.log('[WS] New satellite connection')
    ws.on('message', (data) => handleSatelliteMessage(ws, data))
    ws.on('close', () => handleSatelliteClose(ws))
    ws.on('error', (err) => console.error('[WS] error:', err))
  })
}
async function handleSatelliteMessage(socket: WebSocket, data: WebSocket.RawData) {
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

    if (msg.type === 'tool-result') {
      if (!conn) return
      const res = msg
      const pending = conn.pendingCalls.get(res.id)
      if (!pending) return
      conn.pendingCalls.delete(res.id)
      if (res.ok) pending.resolve(res.result)
      else pending.reject(new Error(res.error))
      return
    }

    if (msg.type === 'tool-output') {
      if (!conn) return
      const pending = conn.pendingCalls.get(msg.id)
      if (!pending) return
      if (msg.attachment) {
        pending.uiLink.addAttachment({
          id: msg.attachment.id,
          mimetype: msg.attachment.type,
          name: msg.attachment.name,
          size: msg.attachment.size,
        })
      }
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
  uiLink: ToolUILink,
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
  const msg: ToolCallMessage = { type: 'tool-call', id, method, params }
  return new Promise((resolve, reject) => {
    conn.pendingCalls.set(id, { uiLink, resolve, reject })

    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(JSON.stringify(msg))
    } else {
      conn.pendingCalls.delete(id)
      reject(new Error('Satellite socket not open'))
    }
  })
}

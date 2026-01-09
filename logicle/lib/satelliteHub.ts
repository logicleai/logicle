import WebSocket from 'ws'
import { Message, Tool, ToolCallMessage, ToolResultMessage } from './satelliteTypes'
import { ToolUILink } from './chat/tools'
import { IncomingMessage } from 'node:http'
import { CallToolResult } from '@modelcontextprotocol/sdk/types'
import { UserProfile } from '@/types/dto'

export interface SatelliteConnection {
  name: string
  tools: Tool[]
  socket: WebSocket
  authenticated: boolean
  pendingCalls: Map<
    string,
    {
      resolve: (value: CallToolResult) => void
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
  }
}

export const hub = globalThis.__satellites as SatelliteHub
export const connections = hub.connections

export async function checkAuthentication(authorization: string): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api/user/profile`, {
      headers: { Authorization: authorization },
    })
    if (res.status !== 200) {
      console.log('Authentication failed')
      return false
    }
    const userProfile = (await res.json()) as UserProfile
    if (userProfile.role !== 'ADMIN') {
      console.log('Only admins can use satellite')
    }
    return true
  } catch (_e) {
    return false
  }
}

const findConnection = (socket: WebSocket) => {
  for (const sc of connections.values()) {
    if (sc.socket === socket) {
      return sc
    }
  }
  return null
}

export async function handleSatelliteConnection(ws: WebSocket, req: IncomingMessage) {
  await checkAuthentication(req.headers.authorization ?? '').then((authenticated) => {
    if (!authenticated) {
      console.log('[SatelliteHub] Connection rejected: not authenticated')
      ws.close(1008, 'Not authenticated')
      return
    }
    const connection = findConnection(ws)
    if (connection) {
      connection.authenticated = true
    }
    console.log('[SatelliteHub] Connection authenticated')
  })
  ws.on('message', (data) => handleSatelliteMessage(ws, data))
  ws.on('close', () => handleSatelliteClose(ws))
  ws.on('error', (err) => console.error('[SatelliteHub] error:', err))
}

async function handleSatelliteMessage(socket: WebSocket, data: WebSocket.RawData) {
  try {
    const msg = JSON.parse(String(data)) as Message
    if (msg.type === 'register') {
      const { name, tools } = msg
      const newConn = {
        name,
        tools,
        socket,
        pendingCalls: new Map(),
        authenticated: false,
      }
      connections.set(name, newConn)
      console.log(
        `[SatelliteHub] "${name}" registered methods: ${tools.map((t) => t.name).join(', ')}`
      )
      return
    }

    if (msg.type === 'tool-result') {
      const conn = findConnection(socket)
      try {
        if (!conn) {
          return
        }
        const res = msg as ToolResultMessage
        const pending = conn.pendingCalls.get(res.id)
        if (!pending) return
        conn.pendingCalls.delete(res.id)
        pending.resolve(res)
        return
      } catch (err) {
        console.error('[SatelliteHub] Error handling tool-result message:', err)
      }
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
): Promise<CallToolResult> {
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

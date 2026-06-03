import WebSocket from 'ws'
import {
  Message,
  RegisteredMessage,
  Tool,
  ToolCallMessage,
  ToolResultMessage,
  ManifestMessage,
  PublishedCapability,
} from '@/lib/satellite/types'
import { ToolUILink } from '@/lib/chat/tools'
import { IncomingMessage } from 'node:http'
import { CallToolResult } from '@modelcontextprotocol/sdk/types'
import { authenticateWithAuthorizationHeader } from '@/backend/api/utils/auth'
import { logger } from '@/lib/logging'
import { getTool } from '@/models/tool'
import { SatelliteInterface } from '@/lib/tools/schemas'

export interface SatelliteConnection {
  satelliteId: string
  name: string
  userId: string
  tools: Tool[]
  socket: WebSocket
  pendingCalls: Map<
    string,
    {
      resolve: (value: CallToolResult) => void
      reject: (reason?: unknown) => void
      uiLink: ToolUILink
    }
  >
  manifest?: {
    capabilities: PublishedCapability[]
  }
  connectedAt: Date
}

export type SatelliteHub = {
  connections: Map<string, SatelliteConnection>
  nextCallId: number
}

export const hub: SatelliteHub = {
  connections: new Map<string, SatelliteConnection>(),
  nextCallId: 1,
}

export const connections = hub.connections

export async function checkAuthentication(authorization: string): Promise<string | null> {
  try {
    const authResult = await authenticateWithAuthorizationHeader(authorization)
    if (!authResult.success) {
      logger.warn('[SatelliteHub] Authentication failed')
      return null
    }
    return authResult.value.userId
  } catch (_e) {
    return null
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
  // Attach listeners immediately so messages sent by the client right after the
  // handshake are not dropped while the async auth check is in flight.
  const messageQueue: WebSocket.RawData[] = []
  const bufferMessage = (data: WebSocket.RawData) => messageQueue.push(data)
  ws.on('message', bufferMessage)
  ws.on('close', () => handleSatelliteClose(ws))
  ws.on('error', (err) => logger.error('[SatelliteHub] error:', err))

  const userId = await checkAuthentication(req.headers.authorization ?? '')
  ws.off('message', bufferMessage)

  if (!userId) {
    logger.warn('[SatelliteHub] Connection rejected: not authenticated')
    ws.close(1008, 'Not authenticated')
    return
  }

  logger.info('[SatelliteHub] Connection authenticated')
  ws.on('message', (data) => handleSatelliteMessage(ws, userId, data))
  for (const data of messageQueue) {
    handleSatelliteMessage(ws, userId, data)
  }
}

async function handleSatelliteMessage(socket: WebSocket, userId: string, data: WebSocket.RawData) {
  try {
    const msg = JSON.parse(String(data)) as Message
    if (msg.type === 'register') {
      const { satelliteId, name, tools } = msg
      const persistedTool = await getTool(satelliteId)
      if (!persistedTool || persistedTool.type !== SatelliteInterface.toolName) {
        logger.warn(
          `[SatelliteHub] Rejected satellite registration for unknown id "${satelliteId}"`
        )
        socket.close(1008, 'Unknown satellite id')
        return
      }

      const existing = connections.get(satelliteId)
      if (existing && existing.socket !== socket) {
        for (const { reject } of existing.pendingCalls.values()) {
          reject(new Error('Satellite replaced by a new connection'))
        }
        existing.pendingCalls.clear()
      }
      const newConn = {
        satelliteId,
        name,
        userId,
        tools,
        socket,
        pendingCalls: new Map(),
        connectedAt: new Date(),
      }
      connections.set(satelliteId, newConn)
      logger.info(
        `[SatelliteHub] "${name}" (${satelliteId}) registered methods: ${tools
          .map((t) => t.name)
          .join(', ')}`
      )
      const registered: RegisteredMessage = {
        type: 'registered',
        satelliteId,
        name,
      }
      socket.send(JSON.stringify(registered))
      return
    }

    if (msg.type === 'manifest') {
      const conn = findConnection(socket)
      if (!conn) {
        logger.warn('[SatelliteHub] Received manifest from unregistered connection')
        return
      }
      const manifest = msg as ManifestMessage
      conn.manifest = {
        capabilities: manifest.capabilities,
      }
      logger.info(
        `[SatelliteHub] "${conn.name}" (${conn.satelliteId}) published capabilities: ${manifest.capabilities
          .map((c) => c.name)
          .join(', ')}`
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
        logger.error('[SatelliteHub] Error handling tool-result message:', err)
      }
    }

    logger.warn('[SatelliteHub] Unknown message from satellite:', msg)
  } catch (err) {
    logger.error('[SatelliteHub] Failed to parse satellite message:', err)
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
    // Socket closed before registering (e.g. auth rejected) — nothing to clean up.
    return
  }

  connections.delete(conn.satelliteId)
  for (const { reject } of conn.pendingCalls.values()) {
    reject(new Error('Satellite disconnected'))
  }
  conn.pendingCalls.clear()
  logger.info(`[SatelliteHub] Satellite disconnected: ${conn.name} (${conn.satelliteId})`)
}

/**
 * Call a method on a named satellite.
 * Used by your Next server code.
 */
export function callSatelliteMethod(
  satelliteId: string,
  method: string,
  uiLink: ToolUILink,
  params: unknown
): Promise<CallToolResult> {
  const conn = connections.get(satelliteId)
  if (!conn) {
    throw new Error(`Satellite "${satelliteId}" is not connected`)
  }
  const tool = conn.tools.find((t) => t.name === method)
  if (!tool) {
    throw new Error(`Satellite "${satelliteId}" does not expose method "${method}"`)
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

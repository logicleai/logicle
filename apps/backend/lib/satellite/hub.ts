import WebSocket from 'ws'
import {
  Message,
  RegisterMessage,
  RegisteredMessage,
  Tool,
  ToolCallMessage,
  ToolResultMessage,
  PublishedCapability,
} from '@/lib/satellite/types'
import { ToolUILink } from '@/lib/chat/tools'
import { IncomingMessage } from 'node:http'
import { CallToolResult } from '@modelcontextprotocol/sdk/types'
import { findSatelliteAuthByApiKey } from '@/backend/api/utils/auth'
import { getSatellite } from '@/models/satellite'
import { createToolWithId, updateToolSatelliteInfo } from '@/models/tool'
import { db } from '@/db/database'
import { logger } from '@/lib/logging'
import { satelliteEventBus } from '@/lib/satellite/events'
import { nanoid } from 'nanoid'

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

interface SatelliteAuthResult {
  userId: string
}

export async function checkSatelliteAuthentication(
  authorization: string
): Promise<SatelliteAuthResult | null> {
  try {
    if (!authorization.startsWith('Bearer ')) {
      logger.warn('[SatelliteHub] Invalid auth header format')
      return null
    }
    const apiKey = authorization.substring(7)
    const auth = await findSatelliteAuthByApiKey(apiKey)
    if (!auth) {
      logger.warn('[SatelliteHub] Authentication failed')
      return null
    }

    if (!auth.scope) {
      return { userId: auth.userId }
    }

    if (!auth.scope.includes('satellite:connect')) {
      logger.warn('[SatelliteHub] API key lacks satellite:connect privilege')
      return null
    }

    return { userId: auth.userId }
  } catch (e) {
    logger.error('[SatelliteHub] Authentication error:', e)
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

async function ensureSatelliteTool(userId: string, satelliteId: string, satelliteName: string) {
  const existing = await db
    .selectFrom('Tool')
    .select('id')
    .where('satelliteId', '=', satelliteId)
    .executeTakeFirst()

  if (existing) {
    await updateToolSatelliteInfo(existing.id, satelliteId, true)
    return
  }

  const createdTool = await createToolWithId(
    nanoid(),
    {
      name: satelliteName,
      description: '',
      type: 'mcp',
      configuration: {},
      tags: [],
      icon: null,
      sharing: { type: 'private' },
      promptFragment: '',
    },
    false,
    false,
    userId
  )

  await updateToolSatelliteInfo(createdTool.id, satelliteId, true)
}

export async function handleSatelliteConnection(ws: WebSocket, req: IncomingMessage) {
  // Attach listeners immediately so messages sent by the client right after the
  // handshake are not dropped while the async auth check is in flight.
  const messageQueue: WebSocket.RawData[] = []
  const bufferMessage = (data: WebSocket.RawData) => messageQueue.push(data)
  ws.on('message', bufferMessage)
  ws.on('close', () => handleSatelliteClose(ws))
  ws.on('error', (err) => logger.error('[SatelliteHub] error:', err))

  const auth = await checkSatelliteAuthentication(req.headers.authorization ?? '')
  ws.off('message', bufferMessage)

  if (!auth) {
    logger.warn('[SatelliteHub] Connection rejected: not authenticated')
    ws.close(1008, 'Not authenticated')
    return
  }

  const { userId } = auth
  logger.info(`[SatelliteHub] Connection authenticated: userId=${userId}`)

  ws.on('message', (data) => handleSatelliteMessage(ws, userId, data))
  for (const data of messageQueue) {
    handleSatelliteMessage(ws, userId, data)
  }
}

async function handleSatelliteMessage(
  socket: WebSocket,
  userId: string,
  data: WebSocket.RawData
) {
  try {
    const msg = JSON.parse(String(data)) as Message

    // Unified register handler for both registered and ephemeral satellites
    if (msg.type === 'register') {
      const registerMsg = msg as RegisterMessage
      const { name, tools, satelliteId: requestedSatelliteId } = registerMsg

      let conn = findConnection(socket)
      if (conn) {
        // Already connected - treat as an update
        conn.tools = tools
        logger.info(
          `[SatelliteHub] "${conn.name}" (${conn.satelliteId}) updated tools`
        )
        return
      }

      let satelliteId: string
      let finalName: string

      if (requestedSatelliteId) {
        satelliteId = requestedSatelliteId
        const satellite = await getSatellite(satelliteId)
        if (!satellite || satellite.userId !== userId) {
          logger.warn(`[SatelliteHub] Satellite ${satelliteId} not found or unauthorized`)
          socket.close(1008, 'Satellite not found or unauthorized')
          return
        }
        finalName = satellite.name
      } else {
        // Missing satelliteId means ephemeral mode.
        satelliteId = `ephemeral_${nanoid()}`
        finalName = name
      }

      // Replace existing connection with same ID
      const existing = connections.get(satelliteId)
      if (existing && existing.socket !== socket) {
        for (const { reject } of existing.pendingCalls.values()) {
          reject(new Error('Satellite replaced by a new connection'))
        }
        existing.pendingCalls.clear()
      }

      const newConn: SatelliteConnection = {
        satelliteId,
        name: finalName,
        userId,
        tools,
        socket,
        pendingCalls: new Map(),
        connectedAt: new Date(),
      }

      connections.set(satelliteId, newConn)
      logger.info(
        `[SatelliteHub] Satellite connected: "${finalName}" (${satelliteId})`
      )

      await ensureSatelliteTool(userId, satelliteId, finalName)

      satelliteEventBus.publish({
        type: 'satellite_connected',
        userId,
        satelliteId,
        satelliteName: finalName,
        tools,
        timestamp: new Date().toISOString(),
      })

      const response: RegisteredMessage = {
        type: 'registered',
        satelliteId,
        name: finalName,
      }
      socket.send(JSON.stringify(response))
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

  // Publish disconnection event
  satelliteEventBus.publish({
    type: 'satellite_disconnected',
    userId: conn.userId,
    satelliteId: conn.satelliteId,
    satelliteName: conn.name,
    timestamp: new Date().toISOString(),
  })
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

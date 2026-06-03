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
import { findSatelliteAuthByApiKey } from '@/backend/api/utils/auth'
import { getSatellite } from '@/models/satellite'
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
  satelliteId?: string // present if registered satellite
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

    // Check if this is a registered satellite API key
    if (auth.scope?.startsWith('satelliteId:')) {
      const satelliteId = auth.scope.substring('satelliteId:'.length)
      const satellite = await getSatellite(satelliteId)
      if (!satellite || satellite.userId !== auth.userId) {
        logger.warn(`[SatelliteHub] Satellite ${satelliteId} not found or unauthorized`)
        return null
      }
      return { userId: auth.userId, satelliteId }
    }

    // Otherwise it's a personal bridge (user API key)
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

  const { userId, satelliteId } = auth
  const mode = satelliteId ? 'registered_satellite' : 'personal'
  logger.info(`[SatelliteHub] Connection authenticated: mode=${mode}, userId=${userId}${satelliteId ? `, satelliteId=${satelliteId}` : ''}`)

  ws.on('message', (data) => handleSatelliteMessage(ws, userId, satelliteId, data))
  for (const data of messageQueue) {
    handleSatelliteMessage(ws, userId, satelliteId, data)
  }
}

async function handleSatelliteMessage(
  socket: WebSocket,
  userId: string,
  authSatelliteId: string | undefined,
  data: WebSocket.RawData
) {
  try {
    const msg = JSON.parse(String(data)) as Message

    // For registered satellites, we already know the ID from the API key
    if (authSatelliteId) {
      // Registered satellite mode - use authenticated satellite ID

      // Support old "register" message for backward compatibility
      if (msg.type === 'register') {
        const { tools } = msg
        const satellite = await getSatellite(authSatelliteId)
        if (!satellite) {
          logger.warn(`[SatelliteHub] Satellite ${authSatelliteId} not found`)
          socket.close(1008, 'Satellite not found')
          return
        }

        const existing = connections.get(authSatelliteId)
        if (existing && existing.socket !== socket) {
          for (const { reject } of existing.pendingCalls.values()) {
            reject(new Error('Satellite replaced by a new connection'))
          }
          existing.pendingCalls.clear()
        }

        const newConn: SatelliteConnection = {
          satelliteId: authSatelliteId,
          name: satellite.name,
          userId,
          tools: tools || [],
          socket,
          pendingCalls: new Map(),
          connectedAt: new Date(),
        }
        connections.set(authSatelliteId, newConn)
        logger.info(
          `[SatelliteHub] Registered satellite connected (old protocol): "${satellite.name}" (${authSatelliteId})`
        )

        satelliteEventBus.publish({
          type: 'satellite_connected',
          userId,
          satelliteId: authSatelliteId,
          satelliteName: satellite.name,
          timestamp: new Date().toISOString(),
        })

        const registered: RegisteredMessage = {
          type: 'registered',
          satelliteId: authSatelliteId,
          name: satellite.name,
        }
        socket.send(JSON.stringify(registered))
        return
      }

      if (msg.type === 'manifest') {
        let conn = findConnection(socket)
        if (!conn) {
          // First manifest - establish connection
          const manifest = msg as ManifestMessage
          const satellite = await getSatellite(authSatelliteId)
          if (!satellite) {
            logger.warn(`[SatelliteHub] Satellite ${authSatelliteId} not found`)
            socket.close(1008, 'Satellite not found')
            return
          }

          const existing = connections.get(authSatelliteId)
          if (existing && existing.socket !== socket) {
            for (const { reject } of existing.pendingCalls.values()) {
              reject(new Error('Satellite replaced by a new connection'))
            }
            existing.pendingCalls.clear()
          }

          const newConn: SatelliteConnection = {
            satelliteId: authSatelliteId,
            name: satellite.name,
            userId,
            tools: [], // Registered satellites don't use tools field
            socket,
            pendingCalls: new Map(),
            manifest: { capabilities: manifest.capabilities },
            connectedAt: new Date(),
          }
          connections.set(authSatelliteId, newConn)
          logger.info(
            `[SatelliteHub] Registered satellite connected: "${satellite.name}" (${authSatelliteId})`
          )

          // Publish connection event with capabilities
          satelliteEventBus.publish({
            type: 'capabilities_available',
            userId,
            satelliteId: authSatelliteId,
            satelliteName: satellite.name,
            capabilities: manifest.capabilities,
            timestamp: new Date().toISOString(),
          })
          return
        }

        // Update manifest for existing connection
        conn = findConnection(socket)
        if (conn) {
          const manifest = msg as ManifestMessage
          conn.manifest = { capabilities: manifest.capabilities }
          logger.info(
            `[SatelliteHub] "${conn.name}" (${conn.satelliteId}) updated capabilities: ${manifest.capabilities
              .map((c) => c.name)
              .join(', ')}`
          )

          satelliteEventBus.publish({
            type: 'capabilities_available',
            userId: conn.userId,
            satelliteId: conn.satelliteId,
            satelliteName: conn.name,
            capabilities: manifest.capabilities,
            timestamp: new Date().toISOString(),
          })
        }
        return
      }

      if (msg.type === 'tool-result') {
        const conn = connections.get(authSatelliteId)
        if (!conn) return
        const res = msg as ToolResultMessage
        const pending = conn.pendingCalls.get(res.id)
        if (!pending) return
        conn.pendingCalls.delete(res.id)
        pending.resolve(res)
        return
      }

      logger.warn('[SatelliteHub] Unknown message from registered satellite:', msg.type)
      return
    }

    // For personal bridges (ephemeral), keep the old register flow for now
    if (msg.type === 'register') {
      const { name, tools } = msg
      // Generate a connection ID for ephemeral connections
      const connectionId = `ephemeral_${nanoid()}`

      const newConn = {
        satelliteId: connectionId,
        name: name || 'Personal Bridge',
        userId,
        tools,
        socket,
        pendingCalls: new Map(),
        connectedAt: new Date(),
      }
      connections.set(connectionId, newConn)
      logger.info(
        `[SatelliteHub] Ephemeral connection established: "${newConn.name}" (${connectionId})`
      )

      const registered: RegisteredMessage = {
        type: 'registered',
        satelliteId: connectionId,
        name: newConn.name,
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

      // Publish manifest event
      satelliteEventBus.publish({
        type: 'capabilities_available',
        userId: conn.userId,
        satelliteId: conn.satelliteId,
        satelliteName: conn.name,
        capabilities: manifest.capabilities,
        timestamp: new Date().toISOString(),
      })

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

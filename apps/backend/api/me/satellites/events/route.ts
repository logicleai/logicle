import { authenticate } from '@/backend/api/utils/auth'
import { satelliteEventBus, SatelliteEvent } from '@/lib/satellite/events'
import { logger } from '@/lib/logging'
import { hub } from '@/lib/satellite/hub'
import { db } from '@/db/database'
import { Tool } from '@/lib/satellite/types'

export const dynamic = 'force-dynamic'

async function filterNewTools(
  satelliteId: string,
  tools: Tool[]
): Promise<Tool[]> {
  // Get already saved tool names for this satellite
  const savedTools = await db
    .selectFrom('Tool')
    .select('name')
    .where('satelliteId', '=', satelliteId)
    .execute()

  const savedNames = new Set(savedTools.map((t) => t.name))

  // Return only tools that haven't been saved yet
  return tools.filter((tool) => !savedNames.has(tool.name))
}

export async function GET(req: Request) {
  const authResult = await authenticate(req)
  if (!authResult.success) {
    return new Response(JSON.stringify({ error: authResult.msg }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const userId = authResult.value.userId
  logger.info(`[SatelliteEvents] SSE connection opened for user ${userId}`)

  // Create SSE response
  const stream = new ReadableStream<string>({
    start(controller) {
      // Send initial snapshot of discoverable satellites (only new tools)
      ;(async () => {
        const discoverableSatellites: Array<{
          satelliteId: string
          satelliteName: string
          tools: Tool[]
        }> = []

        for (const conn of Array.from(hub.connections.values())) {
          if (conn.userId === userId && conn.tools && conn.tools.length > 0) {
            const newTools = await filterNewTools(conn.satelliteId, conn.tools)
            if (newTools.length > 0) {
              discoverableSatellites.push({
                satelliteId: conn.satelliteId,
                satelliteName: conn.name,
                tools: newTools,
              })
            }
          }
        }

        if (discoverableSatellites.length > 0) {
          const discoverableSnapshot = {
            type: 'discoverable_snapshot',
            satellites: discoverableSatellites,
          }
          controller.enqueue(`data: ${JSON.stringify(discoverableSnapshot)}\n\n`)
        }
      })()

      // Subscribe to events and filter new tools
      const unsubscribe = satelliteEventBus.subscribe(userId, async (event: SatelliteEvent) => {
        // If it's a satellite_connected event, filter new tools only
        if (event.type === 'satellite_connected' && 'tools' in event && event.tools) {
          const newTools = await filterNewTools(event.satelliteId, event.tools)
          if (newTools.length === 0) {
            // Don't send event if no new tools
            return
          }
          const filteredEvent = {
            ...event,
            tools: newTools,
          }
          const data = JSON.stringify(filteredEvent)
          controller.enqueue(`data: ${data}\n\n`)
        } else {
          const data = JSON.stringify(event)
          controller.enqueue(`data: ${data}\n\n`)
        }
      })

      // Handle client disconnect
      req.signal.addEventListener('abort', () => {
        logger.info(`[SatelliteEvents] SSE connection closed for user ${userId}`)
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  })
}

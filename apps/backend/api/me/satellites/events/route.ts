import { authenticate } from '@/backend/api/utils/auth'
import { satelliteEventBus, SatelliteEvent } from '@/lib/satellite/events'
import { logger } from '@/lib/logging'
import { hub } from '@/lib/satellite/hub'

export const dynamic = 'force-dynamic'

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
      // Send initial snapshot of connected satellites
      const connectedSatellites = Array.from(hub.connections.values())
        .filter((conn) => conn.userId === userId)
        .map((conn) => ({
          satelliteId: conn.satelliteId,
          satelliteName: conn.name,
        }))

      const snapshot = {
        type: 'snapshot',
        satellites: connectedSatellites,
      }
      controller.enqueue(`data: ${JSON.stringify(snapshot)}\n\n`)

      // Subscribe to events
      const unsubscribe = satelliteEventBus.subscribe(userId, (event: SatelliteEvent) => {
        const data = JSON.stringify(event)
        controller.enqueue(`data: ${data}\n\n`)
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

import { authenticate } from '@/backend/api/utils/auth'
import { satelliteEventBus, SatelliteEvent } from '@/lib/satellite/events'
import { logger } from '@/lib/logging'
import { hub } from '@/lib/satellite/hub'
import { db } from '@/db/database'
import { Tool } from '@/lib/satellite/types'

export const dynamic = 'force-dynamic'

async function satelliteHasTool(satelliteId: string): Promise<boolean> {
  const row = await db
    .selectFrom('Tool')
    .select('id')
    .where('satelliteId', '=', satelliteId)
    .executeTakeFirst()
  return !!row
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

  const stream = new ReadableStream<string>({
    start(controller) {
      // Send initial snapshot of satellites that don't yet have a Logicle tool
      ;(async () => {
        const discoverableSatellites: Array<{
          satelliteId: string
          satelliteName: string
          tools: Tool[]
        }> = []

        for (const conn of Array.from(hub.connections.values())) {
          if (conn.userId === userId && !(await satelliteHasTool(conn.satelliteId))) {
            discoverableSatellites.push({
              satelliteId: conn.satelliteId,
              satelliteName: conn.name,
              tools: conn.tools,
            })
          }
        }

        controller.enqueue(
          `data: ${JSON.stringify({ type: 'discoverable_snapshot', satellites: discoverableSatellites })}\n\n`
        )
      })()

      const unsubscribe = satelliteEventBus.subscribe(userId, async (event: SatelliteEvent) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      })

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

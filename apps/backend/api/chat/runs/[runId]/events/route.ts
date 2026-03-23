import { getChatRunById, listChatRunEvents, subscribeToChatRunRuntime } from '@/backend/lib/chat/chatRuns'
import { forbidden, notFound, operation, responseSpec, errorSpec } from '@/lib/routes'
import { z } from 'zod'

const querySchema = z.object({
  afterSequence: z.coerce.number().int().nonnegative().optional(),
})

const enqueueEvent = (
  controller: ReadableStreamDefaultController<string>,
  sequence: number,
  payload: unknown
) => {
  controller.enqueue(`id: ${sequence}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export const GET = operation({
  name: 'Stream chat run events',
  description: 'Replay and stream live events for an active chat run.',
  authentication: 'user',
  querySchema,
  responses: [responseSpec(200), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params, query, session, signal }) => {
    const run = getChatRunById(params.runId)
    if (!run) {
      return notFound('No such chat run')
    }
    if (run.ownerId !== session.userId) {
      return forbidden()
    }

    const afterSequence = query.afterSequence ?? 0
    return new Response(
      new ReadableStream<string>({
        start(controller) {
          let closed = false
          let lastSentSequence = afterSequence
          let unsubscribe = () => {}

          const close = () => {
            if (closed) return
            closed = true
            unsubscribe()
            try {
              controller.close()
            } catch {
              // stream already closed
            }
          }

          const flushBufferedEvents = () => {
            const events = listChatRunEvents({ runId: params.runId, afterSequence: lastSentSequence })
            for (const event of events) {
              if (event.sequence <= lastSentSequence) continue
              lastSentSequence = event.sequence
              enqueueEvent(controller, event.sequence, event.payload)
            }
          }

          flushBufferedEvents()
          const currentRun = getChatRunById(params.runId)
          if (!currentRun || currentRun.status !== 'running') {
            close()
            return
          }

          unsubscribe = subscribeToChatRunRuntime(params.runId, {
            onEvent(event) {
              if (closed || event.sequence <= lastSentSequence) return
              lastSentSequence = event.sequence
              enqueueEvent(controller, event.sequence, event.payload)
            },
            onClose() {
              close()
            },
          })

          flushBufferedEvents()
          const refreshedRun = getChatRunById(params.runId)
          if (!refreshedRun || refreshedRun.status !== 'running') {
            close()
            return
          }

          signal.addEventListener('abort', close, { once: true })
        },
      }),
      {
        headers: {
          'Content-Encoding': 'none',
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      }
    )
  },
})

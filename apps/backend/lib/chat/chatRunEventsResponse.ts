import { getChatRunById, listChatRunEvents, subscribeToChatRunRuntime } from '@/backend/lib/chat/chatRuns'

const enqueueEvent = (
  controller: ReadableStreamDefaultController<string>,
  sequence: number,
  payload: unknown
) => {
  controller.enqueue(`id: ${sequence}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export const createChatRunEventsResponse = ({
  runId,
  afterSequence = 0,
  signal,
}: {
  runId: string
  afterSequence?: number
  signal: AbortSignal
}) => {
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
          const events = listChatRunEvents({ runId, afterSequence: lastSentSequence })
          for (const event of events) {
            if (event.sequence <= lastSentSequence) continue
            lastSentSequence = event.sequence
            enqueueEvent(controller, event.sequence, event.payload)
          }
        }

        flushBufferedEvents()
        const currentRun = getChatRunById(runId)
        if (!currentRun || currentRun.status !== 'running') {
          close()
          return
        }

        unsubscribe = subscribeToChatRunRuntime(runId, {
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
        const refreshedRun = getChatRunById(runId)
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
}

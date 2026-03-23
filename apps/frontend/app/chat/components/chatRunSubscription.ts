import * as dto from '@/types/dto'

const reconnectDelayMs = (attempt: number) => Math.min(250 * attempt, 1000)

export const maintainChatRunSubscription = async ({
  conversationId,
  runId,
  attempt = 0,
  signal,
  getAfterSequence,
  subscribe,
  getActiveRun,
  waitForReconnect,
  onEvent,
  onReconnect,
  onFinished,
  onFailed,
  isCanceled,
}: {
  conversationId: string
  runId: string
  attempt?: number
  signal: AbortSignal
  getAfterSequence: () => number
  subscribe: (args: {
    runId: string
    afterSequence: number
    signal: AbortSignal
    onEvent: (event: dto.TextStreamPart, sequence: number) => void
    onClose: () => void
  }) => Promise<void>
  getActiveRun: (conversationId: string) => Promise<dto.ChatRun | null | undefined>
  waitForReconnect: (ms: number, signal: AbortSignal) => Promise<void>
  onEvent: (event: dto.TextStreamPart, sequence: number) => void
  onReconnect: (attempt: number) => void
  onFinished: () => void
  onFailed: (error: unknown) => void
  isCanceled: () => boolean
}) => {
  const reconnectOrFinish = async (error?: unknown) => {
    if (signal.aborted || isCanceled()) {
      return
    }

    const activeRun = await getActiveRun(conversationId)
    if (signal.aborted || isCanceled()) {
      return
    }

    if (activeRun?.id === runId) {
      const nextAttempt = attempt + 1
      onReconnect(nextAttempt)
      await waitForReconnect(reconnectDelayMs(nextAttempt), signal)
      if (signal.aborted || isCanceled()) {
        return
      }
      await maintainChatRunSubscription({
        conversationId,
        runId,
        attempt: nextAttempt,
        signal,
        getAfterSequence,
        subscribe,
        getActiveRun,
        waitForReconnect,
        onEvent,
        onReconnect,
        onFinished,
        onFailed,
        isCanceled,
      })
      return
    }

    if (error) {
      onFailed(error)
      return
    }

    onFinished()
  }

  try {
    await subscribe({
      runId,
      afterSequence: getAfterSequence(),
      signal,
      onEvent,
      onClose() {
        void reconnectOrFinish()
      },
    })
  } catch (error) {
    await reconnectOrFinish(error)
  }
}

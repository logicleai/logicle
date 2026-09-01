import * as dto from '@/types/dto'

const reconnectDelayMs = (attempt: number) => Math.min(250 * attempt, 1000)

// Give up after this many consecutive reconnect attempts that make no
// progress (no event received): an unreachable events endpoint would
// otherwise be polled forever with the chat stuck in "receiving".
const maxConsecutiveReconnectAttempts = 10

// Keeps a subscription to a chat run alive until the run is no longer active.
//
// The subscribe promise resolving means the stream closed (cleanly or not):
// as long as the server still reports the run as active we reconnect from the
// last applied sequence, resetting the attempt counter whenever a connection
// made progress. Every exit goes through exactly one of onFinished/onFailed,
// unless the subscription was aborted or superseded.
export const maintainChatRunSubscription = async ({
  conversationId,
  runId,
  attempt = 0,
  signal,
  getAfterSequence,
  subscribe,
  getActiveRun,
  waitForReconnect,
  onOpen,
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
    onOpen?: () => void
    onEvent: (event: dto.TextStreamPart, sequence: number) => void
    onClose: () => void
  }) => Promise<void>
  getActiveRun: (conversationId: string) => Promise<dto.ChatRun | null | undefined>
  waitForReconnect: (ms: number, signal: AbortSignal) => Promise<void>
  onEvent: (event: dto.TextStreamPart, sequence: number) => void
  onOpen?: () => void
  onReconnect: (attempt: number) => void
  onFinished: () => void
  onFailed: (error: unknown) => void
  isCanceled: () => boolean
}) => {
  let currentAttempt = attempt
  for (;;) {
    if (signal.aborted || isCanceled()) {
      return
    }

    let subscribeError: unknown
    let receivedEvent = false
    try {
      await subscribe({
        runId,
        afterSequence: getAfterSequence(),
        signal,
        onOpen,
        onEvent(event, sequence) {
          receivedEvent = true
          onEvent(event, sequence)
        },
        onClose() {},
      })
    } catch (error) {
      subscribeError = error
    }

    if (signal.aborted || isCanceled()) {
      return
    }

    // If we can't even find out whether the run is still active (backend
    // unreachable, error response...), surface a failure rather than
    // finishing silently or leaving the caller hanging.
    let activeRun: dto.ChatRun | null | undefined
    try {
      activeRun = await getActiveRun(conversationId)
    } catch (lookupError) {
      if (!signal.aborted && !isCanceled()) {
        onFailed(subscribeError ?? lookupError)
      }
      return
    }
    if (signal.aborted || isCanceled()) {
      return
    }

    if (activeRun?.id !== runId) {
      if (subscribeError) {
        onFailed(subscribeError)
      } else {
        onFinished()
      }
      return
    }

    currentAttempt = receivedEvent ? 1 : currentAttempt + 1
    if (currentAttempt > maxConsecutiveReconnectAttempts) {
      onFailed(subscribeError ?? new Error('Chat run subscription kept failing'))
      return
    }

    onReconnect(currentAttempt)
    try {
      await waitForReconnect(reconnectDelayMs(currentAttempt), signal)
    } catch {
      // aborted while waiting
      return
    }
  }
}

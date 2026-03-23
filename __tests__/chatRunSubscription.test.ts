import { describe, expect, test, vi } from 'vitest'
import { maintainChatRunSubscription } from '@/app/chat/components/chatRunSubscription'

describe('maintainChatRunSubscription', () => {
  test('reconnects with the latest sequence when the run is still active', async () => {
    const subscribe = vi
      .fn()
      .mockImplementationOnce(async ({ onEvent, onClose }: any) => {
        onEvent({ type: 'text', text: 'a' }, 2)
        onClose()
      })
      .mockImplementationOnce(async ({ afterSequence }: any) => {
        expect(afterSequence).toBe(2)
      })

    let lastSequence = 0

    await maintainChatRunSubscription({
      conversationId: 'conversation-1',
      runId: 'run-1',
      signal: new AbortController().signal,
      getAfterSequence: () => lastSequence,
      subscribe,
      getActiveRun: async () => ({
        id: 'run-1',
      } as any),
      waitForReconnect: async () => {},
      onEvent: (_event, sequence) => {
        lastSequence = sequence
      },
      onReconnect: vi.fn(),
      onFinished: vi.fn(),
      onFailed: vi.fn(),
      isCanceled: () => false,
    })

    expect(subscribe).toHaveBeenCalledTimes(2)
  })
})

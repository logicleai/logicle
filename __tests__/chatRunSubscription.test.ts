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
      getActiveRun: async () =>
        ({
          id: 'run-1',
        }) as any,
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

  test('fails instead of hanging when the active-run lookup throws after a subscribe error', async () => {
    const subscribeError = new Error('subscribe failed')
    const onFailed = vi.fn()
    const onFinished = vi.fn()

    await maintainChatRunSubscription({
      conversationId: 'conversation-1',
      runId: 'run-1',
      signal: new AbortController().signal,
      getAfterSequence: () => 0,
      subscribe: vi.fn().mockRejectedValue(subscribeError),
      getActiveRun: vi.fn().mockRejectedValue(new Error('backend unreachable')),
      waitForReconnect: async () => {},
      onEvent: vi.fn(),
      onReconnect: vi.fn(),
      onFinished,
      onFailed,
      isCanceled: () => false,
    })

    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onFailed).toHaveBeenCalledWith(subscribeError)
    expect(onFinished).not.toHaveBeenCalled()
  })

  test('fails instead of finishing silently when the active-run lookup throws after a clean close', async () => {
    const lookupError = new Error('backend unreachable')
    const onFailed = vi.fn()
    const onFinished = vi.fn()

    await maintainChatRunSubscription({
      conversationId: 'conversation-1',
      runId: 'run-1',
      signal: new AbortController().signal,
      getAfterSequence: () => 0,
      subscribe: vi.fn().mockImplementation(async ({ onClose }: any) => {
        onClose()
      }),
      getActiveRun: vi.fn().mockRejectedValue(lookupError),
      waitForReconnect: async () => {},
      onEvent: vi.fn(),
      onReconnect: vi.fn(),
      onFinished,
      onFailed,
      isCanceled: () => false,
    })

    // onClose kicks off the lookup without awaiting it
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onFailed).toHaveBeenCalledWith(lookupError)
    expect(onFinished).not.toHaveBeenCalled()
  })

  test('finishes when the run is no longer active after a clean close', async () => {
    const onFailed = vi.fn()
    const onFinished = vi.fn()

    await maintainChatRunSubscription({
      conversationId: 'conversation-1',
      runId: 'run-1',
      signal: new AbortController().signal,
      getAfterSequence: () => 0,
      subscribe: vi.fn().mockImplementation(async ({ onClose }: any) => {
        onClose()
      }),
      getActiveRun: vi.fn().mockResolvedValue(null),
      waitForReconnect: async () => {},
      onEvent: vi.fn(),
      onReconnect: vi.fn(),
      onFinished,
      onFailed,
      isCanceled: () => false,
    })

    // onClose kicks off the lookup without awaiting it
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFailed).not.toHaveBeenCalled()
  })
})

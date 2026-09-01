import { describe, expect, test, vi } from 'vitest'
import { maintainChatRunSubscription } from '@/app/chat/components/chatRunSubscription'

describe('maintainChatRunSubscription', () => {
  test('reconnects with the latest sequence when the run is still active', async () => {
    const subscribe = vi
      .fn()
      .mockImplementationOnce(async ({ onEvent }: any) => {
        onEvent({ type: 'text', text: 'a' }, 2)
      })
      .mockImplementationOnce(async ({ afterSequence }: any) => {
        expect(afterSequence).toBe(2)
      })

    let lastSequence = 0
    const onFinished = vi.fn()

    await maintainChatRunSubscription({
      conversationId: 'conversation-1',
      runId: 'run-1',
      signal: new AbortController().signal,
      getAfterSequence: () => lastSequence,
      subscribe,
      getActiveRun: vi.fn().mockResolvedValueOnce({ id: 'run-1' }).mockResolvedValue(null),
      waitForReconnect: async () => {},
      onEvent: (_event, sequence) => {
        lastSequence = sequence
      },
      onReconnect: vi.fn(),
      onFinished,
      onFailed: vi.fn(),
      isCanceled: () => false,
    })

    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(onFinished).toHaveBeenCalledTimes(1)
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
      subscribe: vi.fn().mockResolvedValue(undefined),
      getActiveRun: vi.fn().mockRejectedValue(lookupError),
      waitForReconnect: async () => {},
      onEvent: vi.fn(),
      onReconnect: vi.fn(),
      onFinished,
      onFailed,
      isCanceled: () => false,
    })

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
      subscribe: vi.fn().mockResolvedValue(undefined),
      getActiveRun: vi.fn().mockResolvedValue(null),
      waitForReconnect: async () => {},
      onEvent: vi.fn(),
      onReconnect: vi.fn(),
      onFinished,
      onFailed,
      isCanceled: () => false,
    })

    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFailed).not.toHaveBeenCalled()
  })

  test('gives up after too many consecutive reconnect attempts without progress', async () => {
    const subscribe = vi.fn().mockResolvedValue(undefined)
    const onReconnect = vi.fn()
    const onFailed = vi.fn()
    const onFinished = vi.fn()

    await maintainChatRunSubscription({
      conversationId: 'conversation-1',
      runId: 'run-1',
      signal: new AbortController().signal,
      getAfterSequence: () => 0,
      subscribe,
      getActiveRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      waitForReconnect: async () => {},
      onEvent: vi.fn(),
      onReconnect,
      onFinished,
      onFailed,
      isCanceled: () => false,
    })

    expect(subscribe).toHaveBeenCalledTimes(11)
    expect(onReconnect).toHaveBeenCalledTimes(10)
    expect(onFailed).toHaveBeenCalledTimes(1)
    expect(onFinished).not.toHaveBeenCalled()
  })

  test('resets the attempt counter when a connection makes progress', async () => {
    const subscribe = vi
      .fn()
      .mockImplementationOnce(async ({ onEvent }: any) => {
        onEvent({ type: 'text', text: 'a' }, 1)
      })
      .mockResolvedValue(undefined)
    const onReconnect = vi.fn()
    const onFinished = vi.fn()
    const onFailed = vi.fn()

    await maintainChatRunSubscription({
      conversationId: 'conversation-1',
      runId: 'run-1',
      attempt: 9,
      signal: new AbortController().signal,
      getAfterSequence: () => 0,
      subscribe,
      getActiveRun: vi.fn().mockResolvedValueOnce({ id: 'run-1' }).mockResolvedValue(null),
      waitForReconnect: async () => {},
      onEvent: vi.fn(),
      onReconnect,
      onFinished,
      onFailed,
      isCanceled: () => false,
    })

    // Without the reset, starting at attempt 9 plus one no-progress cycle
    // would already be close to the cap; progress must bring it back to 1.
    expect(onReconnect).toHaveBeenCalledWith(1)
    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(onFailed).not.toHaveBeenCalled()
  })

  test('stops silently when aborted while waiting to reconnect', async () => {
    const abortController = new AbortController()
    const onFailed = vi.fn()
    const onFinished = vi.fn()

    await maintainChatRunSubscription({
      conversationId: 'conversation-1',
      runId: 'run-1',
      signal: abortController.signal,
      getAfterSequence: () => 0,
      subscribe: vi.fn().mockResolvedValue(undefined),
      getActiveRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      waitForReconnect: async () => {
        abortController.abort()
        throw new DOMException('Aborted', 'AbortError')
      },
      onEvent: vi.fn(),
      onReconnect: vi.fn(),
      onFinished,
      onFailed,
      isCanceled: () => false,
    })

    expect(onFailed).not.toHaveBeenCalled()
    expect(onFinished).not.toHaveBeenCalled()
  })
})

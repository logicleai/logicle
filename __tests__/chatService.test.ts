import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const fetchEventSourceMock = vi.fn()

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: fetchEventSourceMock,
}))

describe('subscribeToChatRun', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchEventSourceMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('subscribes to the run SSE endpoint and forwards parsed events with sequence ids', async () => {
    fetchEventSourceMock.mockImplementation(async (_url: string, init: any) => {
      await init.onopen({
        ok: true,
        headers: {
          get: () => 'text/event-stream; charset=utf-8',
        },
      })
      init.onmessage({
        id: '7',
        data: JSON.stringify({
          type: 'text',
          text: 'hi',
        }),
      })
      init.onclose()
    })

    const { subscribeToChatRun } = await import('@/services/chat')
    const onEvent = vi.fn()
    const onOpen = vi.fn()
    const onClose = vi.fn()

    await subscribeToChatRun({
      runId: 'run-1',
      afterSequence: 3,
      signal: new AbortController().signal,
      onEvent,
      onOpen,
      onClose,
    })

    expect(fetchEventSourceMock).toHaveBeenCalledWith(
      '/api/chat/runs/run-1/events?afterSequence=3',
      expect.objectContaining({
        method: 'GET',
        openWhenHidden: true,
      })
    )
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith({ type: 'text', text: 'hi' }, 7)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('throws when the response is not an SSE stream', async () => {
    fetchEventSourceMock.mockImplementation(async (_url: string, init: any) => {
      await init.onopen({
        ok: false,
        headers: {
          get: () => 'application/json',
        },
      })
    })

    const { subscribeToChatRun } = await import('@/services/chat')

    await expect(
      subscribeToChatRun({
        runId: 'run-2',
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      })
    ).rejects.toThrow('Failed subscribing to chat run')
  })
})

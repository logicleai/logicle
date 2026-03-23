import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as dto from '@/types/dto'

describe('chat run registry', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useRealTimers()
  })

  test('creates one active run per conversation and exposes it by conversation and id', async () => {
    const chatRuns = await import('@/backend/lib/chat/chatRuns')

    const created = chatRuns.createChatRun({
      conversationId: 'conversation-1',
      ownerId: 'user-1',
      requestMessageId: 'message-1',
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      throw new Error('Expected run creation to succeed')
    }

    expect(chatRuns.getChatRunById(created.run.id)).toEqual(created.run)
    expect(chatRuns.getActiveChatRunForConversation('conversation-1')).toEqual(created.run)

    const second = chatRuns.createChatRun({
      conversationId: 'conversation-1',
      ownerId: 'user-1',
      requestMessageId: 'message-2',
    })

    expect(second).toEqual({
      ok: false,
      run: created.run,
    })
  })

  test('publishes events to subscribers and supports replay from sequence', async () => {
    const chatRuns = await import('@/backend/lib/chat/chatRuns')
    const created = chatRuns.createChatRun({
      conversationId: 'conversation-2',
      ownerId: 'user-2',
      requestMessageId: 'message-1',
    })
    if (!created.ok) {
      throw new Error('Expected run creation to succeed')
    }

    const received: dto.TextStreamPart[] = []
    const unsubscribe = chatRuns.subscribeToChatRunRuntime(created.run.id, {
      onEvent(event) {
        received.push(event.payload)
      },
      onClose() {},
    })

    const firstEvent: dto.TextStreamPart = {
      type: 'message',
      msg: {
        id: 'assistant-1',
        conversationId: 'conversation-2',
        parent: 'message-1',
        sentAt: new Date().toISOString(),
        role: 'assistant',
        parts: [],
      },
    }
    const secondEvent: dto.TextStreamPart = {
      type: 'part',
      part: {
        type: 'text',
        text: 'hello',
      },
    }

    await chatRuns.persistAndPublishChatRunEvent(created.run.id, firstEvent)
    await chatRuns.persistAndPublishChatRunEvent(created.run.id, secondEvent)

    expect(received).toEqual([firstEvent, secondEvent])

    const replay = chatRuns.listChatRunEvents({
      runId: created.run.id,
      afterSequence: 1,
    })

    expect(replay).toHaveLength(1)
    expect(replay[0].payload).toEqual(secondEvent)

    unsubscribe()
    chatRuns.closeChatRun(created.run.id)
  })

  test('stop requests abort the run and terminal runs are cleaned up after a delay', async () => {
    vi.useFakeTimers()
    const chatRuns = await import('@/backend/lib/chat/chatRuns')
    const created = chatRuns.createChatRun({
      conversationId: 'conversation-3',
      ownerId: 'user-3',
      requestMessageId: 'message-1',
    })
    if (!created.ok) {
      throw new Error('Expected run creation to succeed')
    }

    const closed = vi.fn()
    chatRuns.subscribeToChatRunRuntime(created.run.id, {
      onEvent() {},
      onClose: closed,
    })

    const stopped = chatRuns.requestChatRunStop(created.run.id)
    expect(stopped?.stopRequestedAt).toBeTruthy()
    expect(chatRuns.isChatRunAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true)

    chatRuns.finalizeChatRun({
      runId: created.run.id,
      status: 'stopped',
    })

    expect(chatRuns.getActiveChatRunForConversation('conversation-3')).toBeUndefined()
    expect(chatRuns.getChatRunById(created.run.id)?.status).toBe('stopped')
    expect(closed).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)

    expect(chatRuns.getChatRunById(created.run.id)).toBeUndefined()
  })
})

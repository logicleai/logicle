import { describe, expect, test } from 'vitest'
import {
  applyChatRunEventToConversation,
  applyChatRunFailureToConversation,
  finishChatRunConversation,
  THINKING_PLACEHOLDER_ID,
} from '@/app/chat/components/chatRunConversationState'
import * as dto from '@/types/dto'
import { ConversationWithMessages } from '@/lib/chat/types'

const conversation: ConversationWithMessages = {
  id: 'conversation-1',
  assistantId: 'assistant-1',
  name: 'Original',
  ownerId: 'user-1',
  createdAt: '2026-03-23T00:00:00.000Z',
  lastMsgSentAt: '2026-03-23T00:00:00.000Z',
  messages: [
    {
      id: 'assistant-1',
      conversationId: 'conversation-1',
      parent: null,
      sentAt: '2026-03-23T00:00:00.000Z',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hello' }],
    } satisfies dto.AssistantMessage,
  ],
}

describe('chatRunConversationState', () => {
  test.each([true, false])('handles a continuation ending without output (allow=%s)', (allow) => {
    const base = conversation.messages[0]!
    const messages: dto.Message[] = [
      ...conversation.messages,
      {
        ...base,
        id: 'pause',
        role: 'user-request',
        parent: base.id,
        request: { type: 'tool-step-limit', maxIterations: 30 },
      },
      { ...base, id: 'response', role: 'user-response', parent: 'pause', allow },
      { ...base, id: THINKING_PLACEHOLDER_ID, role: 'assistant', parent: 'response', parts: [] },
    ]
    const result = finishChatRunConversation({ ...conversation, messages }, false, 'failed')
    expect(result.messages.map((message) => message.id)).toEqual([base.id, 'pause', 'response'])
    expect(result.messages.at(-1)).toEqual(
      allow ? { ...messages[2], error: 'failed' } : messages[2]
    )
  })

  test('applies summary updates to the conversation title', () => {
    expect(
      applyChatRunEventToConversation(conversation, {
        type: 'summary',
        summary: 'Renamed',
      })
    ).toMatchObject({
      name: 'Renamed',
    })
  })

  test('decorates the last message with a stream failure', () => {
    const result = applyChatRunFailureToConversation({
      conversation,
      error: 'failed',
    })

    expect(result.messages[result.messages.length - 1]).toMatchObject({
      error: 'failed',
    })
  })
})

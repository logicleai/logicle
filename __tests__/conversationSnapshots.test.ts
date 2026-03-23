import { describe, expect, test } from 'vitest'
import { mergeConversationSnapshot } from '@/app/chat/components/conversationSnapshots'
import * as dto from '@/types/dto'
import { ConversationWithMessages } from '@/lib/chat/types'

const createUserMessage = (id: string): dto.UserMessage => ({
  id,
  conversationId: 'conversation-1',
  role: 'user',
  content: `message-${id}`,
  attachments: [],
  parent: null,
  sentAt: '2026-03-23T00:00:00.000Z',
})

const createAssistantMessage = (id: string, text: string): dto.AssistantMessage => ({
  id,
  conversationId: 'conversation-1',
  role: 'assistant',
  parts: [{ type: 'text', text }],
  parent: 'user-1',
  sentAt: '2026-03-23T00:00:01.000Z',
})

const createConversation = (messages: dto.Message[]): ConversationWithMessages => ({
  id: 'conversation-1',
  assistantId: 'assistant-1',
  name: 'Test conversation',
  ownerId: 'user-1',
  createdAt: '2026-03-23T00:00:00.000Z',
  lastMsgSentAt: '2026-03-23T00:00:01.000Z',
  messages,
})

describe('mergeConversationSnapshot', () => {
  test('preserves local replayed messages while an active run subscription is attached', () => {
    const cachedConversation = createConversation([
      createUserMessage('user-1'),
      createAssistantMessage('assistant-1', 'partial from replay'),
    ])
    const serverConversation = createConversation([createUserMessage('user-1')])

    const merged = mergeConversationSnapshot({
      cachedConversation,
      nextConversation: serverConversation,
      preserveLocalMessages: true,
    })

    expect(merged.messages).toEqual(cachedConversation.messages)
  })

  test('prefers server messages when local preservation is disabled', () => {
    const cachedConversation = createConversation([
      createUserMessage('user-1'),
      createAssistantMessage('assistant-1', 'partial from replay'),
    ])
    const serverConversation = createConversation([
      createUserMessage('user-1'),
      createAssistantMessage('assistant-1', 'completed from db'),
    ])

    const merged = mergeConversationSnapshot({
      cachedConversation,
      nextConversation: serverConversation,
      preserveLocalMessages: false,
    })

    expect(merged.messages).toEqual(serverConversation.messages)
  })
})

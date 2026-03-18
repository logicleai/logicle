import { describe, expect, test } from 'vitest'
import { ChatState } from '@/backend/lib/chat/ChatState'
import type * as dto from '@/types/dto'

// ---- helpers ----

const base = { conversationId: 'conv1', sentAt: '2024-01-01T00:00:00.000Z', parent: null }

const userMsg = (id: string, parent: string | null = null): dto.UserMessage => ({
  ...base,
  id,
  parent,
  role: 'user',
  content: `content-${id}`,
  attachments: [],
})

const assistantMsg = (id: string, parent: string | null = null): dto.AssistantMessage => ({
  ...base,
  id,
  parent,
  role: 'assistant',
  parts: [],
})

// ---- constructor ----

describe('ChatState constructor', () => {
  test('sets chatHistory and conversationId from first message', () => {
    const msg = userMsg('m1')
    const state = new ChatState([msg])
    expect(state.chatHistory).toHaveLength(1)
    expect(state.conversationId).toBe('conv1')
  })
})

// ---- push ----

describe('ChatState.push', () => {
  test('appends a message and returns it', async () => {
    const state = new ChatState([userMsg('m1')])
    const m2 = assistantMsg('m2', 'm1')
    const returned = await state.push(m2)
    expect(returned).toBe(m2)
    expect(state.chatHistory).toHaveLength(2)
    expect(state.chatHistory[1]).toBe(m2)
  })

  test('does not mutate the original array', async () => {
    const initial = [userMsg('m1')]
    const state = new ChatState(initial)
    await state.push(assistantMsg('m2'))
    expect(initial).toHaveLength(1)
  })
})

// ---- createToolMsg ----

describe('ChatState.createToolMsg', () => {
  test('creates a tool message with correct fields', () => {
    const state = new ChatState([userMsg('m1')])
    const msg = state.createToolMsg()
    expect(msg.role).toBe('tool')
    expect(msg.conversationId).toBe('conv1')
    expect(msg.parent).toBe('m1')
    expect(msg.parts).toEqual([])
    expect(typeof msg.id).toBe('string')
    expect(msg.id.length).toBeGreaterThan(0)
  })

  test('parent is the last message in history', async () => {
    const state = new ChatState([userMsg('m1')])
    await state.push(assistantMsg('m2', 'm1'))
    const msg = state.createToolMsg()
    expect(msg.parent).toBe('m2')
  })
})

// ---- createEmptyAssistantMsg ----

describe('ChatState.createEmptyAssistantMsg', () => {
  test('creates assistant message with correct fields', () => {
    const state = new ChatState([userMsg('m1')])
    const msg = state.createEmptyAssistantMsg()
    expect(msg.role).toBe('assistant')
    expect(msg.parts).toEqual([])
    expect(msg.conversationId).toBe('conv1')
    expect(msg.parent).toBe('m1')
  })
})

// ---- createUserRequestMsg ----

describe('ChatState.createUserRequestMsg', () => {
  test('creates a user-request message', () => {
    const state = new ChatState([userMsg('m1')])
    const request: dto.UserRequest = {
      type: 'tool-call-authorization',
      toolCallId: 'tc1',
      toolName: 'search',
      args: {},
    }
    const msg = state.createUserRequestMsg(request)
    expect(msg.role).toBe('user-request')
    expect((msg as dto.UserRequestMessage).request).toBe(request)
    expect(msg.parent).toBe('m1')
  })
})

// ---- getLastMessage ----

describe('ChatState.getLastMessage', () => {
  test('returns the last message', () => {
    const m1 = userMsg('m1')
    const m2 = assistantMsg('m2')
    const state = new ChatState([m1, m2])
    expect(state.getLastMessage()).toBe(m2)
  })
})

// ---- getLastMessageAssert ----

describe('ChatState.getLastMessageAssert', () => {
  test('returns message when role matches', () => {
    const msg = userMsg('m1')
    const state = new ChatState([msg])
    expect(state.getLastMessageAssert('user')).toBe(msg)
  })

  test('throws when role does not match', () => {
    const state = new ChatState([userMsg('m1')])
    expect(() => state.getLastMessageAssert('assistant')).toThrow('role mismatch')
  })
})

// ---- applyStreamPart ----

describe('ChatState.applyStreamPart', () => {
  test('message part adds a new message to history', () => {
    const state = new ChatState([userMsg('m1')])
    const a = assistantMsg('a1', 'm1')
    state.applyStreamPart({ type: 'message', msg: a })
    expect(state.chatHistory).toHaveLength(2)
    expect(state.chatHistory[1]).toBe(a)
  })

  test('summary part is a no-op', () => {
    const state = new ChatState([userMsg('m1')])
    state.applyStreamPart({ type: 'summary', summary: 'ignored' })
    expect(state.chatHistory).toHaveLength(1)
  })

  test('text delta updates last message', () => {
    const state = new ChatState([
      userMsg('m1'),
      { ...assistantMsg('a1', 'm1'), parts: [{ type: 'text', text: 'hel' }] },
    ])
    state.applyStreamPart({ type: 'text', text: 'lo' })
    const last = state.chatHistory[state.chatHistory.length - 1] as dto.AssistantMessage
    expect((last.parts[0] as dto.TextPart).text).toBe('hello')
  })
})

// ---- appendMessage ----

describe('ChatState.appendMessage', () => {
  test('appends and returns the message as last', () => {
    const state = new ChatState([userMsg('m1')])
    const a = assistantMsg('a1', 'm1')
    const returned = state.appendMessage(a)
    expect(returned).toEqual(a)
    expect(state.chatHistory).toHaveLength(2)
  })
})

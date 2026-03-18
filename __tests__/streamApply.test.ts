import { describe, expect, test } from 'vitest'
import { applyStreamPartToMessage, applyStreamPartToMessages } from '@/lib/chat/streamApply'
import type * as dto from '@/types/dto'

// ---- helpers ----

const base = {
  conversationId: 'c1',
  sentAt: '2024-01-01T00:00:00.000Z',
  parent: null,
}

const assistantMsg = (parts: dto.AssistantMessagePart[] = []): dto.AssistantMessage => ({
  ...base,
  id: 'm1',
  role: 'assistant',
  parts,
})

const userMsg = (): dto.UserMessage => ({
  ...base,
  id: 'm0',
  role: 'user',
  content: 'hello',
  attachments: [],
})

const toolMsg = (parts: (dto.ToolCallResultPart | dto.DebugPart)[] = []): dto.ToolMessage => ({
  ...base,
  id: 'm2',
  role: 'tool',
  parts,
})

// ---- applyStreamPartToMessage ----

describe('applyStreamPartToMessage – part', () => {
  test('appends a text part to an assistant message', () => {
    const textPart: dto.TextPart = { type: 'text', text: 'hello' }
    const result = applyStreamPartToMessage(assistantMsg(), { type: 'part', part: textPart })
    expect((result as dto.AssistantMessage).parts).toHaveLength(1)
    expect((result as dto.AssistantMessage).parts[0]).toEqual(textPart)
  })

  test('appends a reasoning part to an assistant message', () => {
    const reasoningPart: dto.ReasoningPart = { type: 'reasoning', reasoning: 'thinking…' }
    const result = applyStreamPartToMessage(assistantMsg(), { type: 'part', part: reasoningPart })
    expect((result as dto.AssistantMessage).parts[0]).toEqual(reasoningPart)
  })

  test('appends a tool-result part to a tool message', () => {
    const toolResult: dto.ToolCallResultPart = {
      type: 'tool-result',
      toolCallId: 'tc1',
      toolName: 'search',
      result: { type: 'text', value: 'ok' },
    }
    const result = applyStreamPartToMessage(toolMsg(), { type: 'part', part: toolResult })
    expect((result as dto.ToolMessage).parts[0]).toEqual(toolResult)
  })

  test('throws when appending invalid part type to assistant message', () => {
    const badPart = { type: 'tool-result', toolCallId: 'x', toolName: 'y', result: { type: 'text', value: '' } } as unknown as dto.MessagePart
    expect(() =>
      applyStreamPartToMessage(assistantMsg(), { type: 'part', part: badPart })
    ).toThrow('Invalid assistant part type')
  })

  test('throws when appending invalid part type to tool message', () => {
    const badPart: dto.TextPart = { type: 'text', text: 'nope' }
    expect(() =>
      applyStreamPartToMessage(toolMsg(), { type: 'part', part: badPart as unknown as dto.MessagePart })
    ).toThrow('Invalid tool part type')
  })

  test('throws when appending part to user message', () => {
    const textPart: dto.TextPart = { type: 'text', text: 'x' }
    expect(() =>
      applyStreamPartToMessage(userMsg(), { type: 'part', part: textPart })
    ).toThrow('Cannot append parts to message role user')
  })
})

describe('applyStreamPartToMessage – text delta', () => {
  test('appends text to last text part', () => {
    const msg = assistantMsg([{ type: 'text', text: 'hel' }])
    const result = applyStreamPartToMessage(msg, { type: 'text', text: 'lo' }) as dto.AssistantMessage
    expect((result.parts[0] as dto.TextPart).text).toBe('hello')
    expect(result.parts).toHaveLength(1)
  })

  test('throws when last part is not text', () => {
    const msg = assistantMsg([{ type: 'reasoning', reasoning: 'thinking' }])
    expect(() =>
      applyStreamPartToMessage(msg, { type: 'text', text: ' world' })
    ).toThrow('last part is not text')
  })

  test('throws for text delta on non-assistant message', () => {
    expect(() =>
      applyStreamPartToMessage(userMsg(), { type: 'text', text: 'x' })
    ).toThrow('non-assistant message')
  })
})

describe('applyStreamPartToMessage – reasoning delta', () => {
  test('appends reasoning to last reasoning part', () => {
    const msg = assistantMsg([{ type: 'reasoning', reasoning: 'think' }])
    const result = applyStreamPartToMessage(msg, { type: 'reasoning', reasoning: 'ing' }) as dto.AssistantMessage
    expect((result.parts[0] as dto.ReasoningPart).reasoning).toBe('thinking')
  })

  test('throws when last part is not reasoning', () => {
    const msg = assistantMsg([{ type: 'text', text: 'hi' }])
    expect(() =>
      applyStreamPartToMessage(msg, { type: 'reasoning', reasoning: ' more' })
    ).toThrow('last part is not reasoning')
  })

  test('throws for reasoning delta on non-assistant message', () => {
    expect(() =>
      applyStreamPartToMessage(userMsg(), { type: 'reasoning', reasoning: 'think' })
    ).toThrow('non-assistant message')
  })
})

describe('applyStreamPartToMessage – unsupported type', () => {
  test('throws for completely unknown stream part type', () => {
    expect(() =>
      applyStreamPartToMessage(assistantMsg(), { type: 'unknown-type' } as unknown as dto.TextStreamPart)
    ).toThrow('Unsupported stream part type')
  })
})

describe('applyStreamPartToMessage – citations', () => {
  test('appends citations to message', () => {
    const result = applyStreamPartToMessage(assistantMsg(), {
      type: 'citations',
      citations: ['https://example.com'],
    })
    expect(result.citations).toEqual(['https://example.com'])
  })

  test('merges with existing citations', () => {
    const msg = { ...assistantMsg(), citations: ['a'] }
    const result = applyStreamPartToMessage(msg, { type: 'citations', citations: ['b', 'c'] })
    expect(result.citations).toEqual(['a', 'b', 'c'])
  })
})

describe('applyStreamPartToMessage – attachment', () => {
  test('appends attachment to user message', () => {
    const attachment: dto.Attachment = { id: 'f1', mimetype: 'image/png', name: 'img.png', size: 100 }
    const result = applyStreamPartToMessage(userMsg(), { type: 'attachment', attachment }) as dto.UserMessage
    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]).toEqual(attachment)
  })

  test('throws for attachment on non-user message', () => {
    const attachment: dto.Attachment = { id: 'f1', mimetype: 'image/png', name: 'img.png', size: 100 }
    expect(() =>
      applyStreamPartToMessage(assistantMsg(), { type: 'attachment', attachment })
    ).toThrow('non-user message')
  })
})

// ---- applyStreamPartToMessages ----

describe('applyStreamPartToMessages', () => {
  test('message part prepends a new message', () => {
    const newMsg = userMsg()
    const result = applyStreamPartToMessages([], { type: 'message', msg: newMsg })
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(newMsg)
  })

  test('summary returns messages unchanged', () => {
    const msgs = [userMsg()]
    const result = applyStreamPartToMessages(msgs, { type: 'summary', summary: 'a summary' })
    expect(result).toBe(msgs)
  })

  test('throws when no messages and a non-message part arrives', () => {
    expect(() =>
      applyStreamPartToMessages([], { type: 'text', text: 'hi' })
    ).toThrow('No message available')
  })

  test('applies update to the last message only', () => {
    const u = userMsg()
    const a = assistantMsg([{ type: 'text', text: 'start' }])
    const result = applyStreamPartToMessages([u, a], { type: 'text', text: '!' })
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(u) // first message unchanged (same reference)
    expect((result[1] as dto.AssistantMessage).parts[0]).toMatchObject({ text: 'start!' })
  })
})

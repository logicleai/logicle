import { describe, expect, test } from 'vitest'
import { convertToLitellmChatMessages } from '@/lib/chat/litellm/convert-to-litellm-chat-messages'
import { UnsupportedFunctionalityError } from '@ai-sdk/provider'
import type { LanguageModelV2Prompt } from '@ai-sdk/provider'

describe('convertToLitellmChatMessages', () => {
  test('converts a system message', () => {
    const prompt: LanguageModelV2Prompt = [{ role: 'system', content: 'You are helpful.' }]
    const result = convertToLitellmChatMessages(prompt)
    expect(result).toEqual([{ role: 'system', content: 'You are helpful.' }])
  })

  test('converts a simple user text message to string content', () => {
    const prompt: LanguageModelV2Prompt = [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]
    const result = convertToLitellmChatMessages(prompt)
    expect(result).toEqual([{ role: 'user', content: 'Hello' }])
  })

  test('converts multi-part user message to array content', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Look at this:' },
          { type: 'text', text: ' interesting.' },
        ],
      },
    ]
    const result = convertToLitellmChatMessages(prompt)
    const msg = result[0] as { role: string; content: unknown[] }
    expect(msg.role).toBe('user')
    expect(Array.isArray(msg.content)).toBe(true)
  })

  test('converts image file part to image_url', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: new Uint8Array([1, 2, 3]),
          },
        ],
      },
    ]
    const result = convertToLitellmChatMessages(prompt)
    const msg = result[0] as { role: string; content: { type: string; image_url: { url: string } }[] }
    expect(msg.content[0].type).toBe('image_url')
    expect(msg.content[0].image_url.url).toMatch(/^data:image\/png;base64,/)
  })

  test('converts image/* to image/jpeg', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'image/*', data: new Uint8Array([]) }],
      },
    ]
    const result = convertToLitellmChatMessages(prompt)
    const msg = result[0] as { content: { image_url: { url: string } }[] }
    expect(msg.content[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
  })

  test('uses URL directly for image URL parts', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'image/png', data: new URL('https://example.com/img.png') }],
      },
    ]
    const result = convertToLitellmChatMessages(prompt)
    const msg = result[0] as { content: { image_url: { url: string } }[] }
    expect(msg.content[0].image_url.url).toBe('https://example.com/img.png')
  })

  test('throws for non-image file parts', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'application/pdf', data: new Uint8Array([]) }],
      },
    ]
    expect(() => convertToLitellmChatMessages(prompt)).toThrow(UnsupportedFunctionalityError)
  })

  test('converts assistant message with text only', () => {
    const prompt: LanguageModelV2Prompt = [
      { role: 'assistant', content: [{ type: 'text', text: 'I can help.' }] },
    ]
    const result = convertToLitellmChatMessages(prompt)
    expect(result).toEqual([{ role: 'assistant', content: 'I can help.', tool_calls: undefined }])
  })

  test('converts assistant message with tool calls', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 'call1', toolName: 'search', input: { q: 'cats' } },
        ],
      },
    ]
    const result = convertToLitellmChatMessages(prompt)
    const msg = result[0] as { role: string; tool_calls: unknown[] }
    expect(msg.role).toBe('assistant')
    expect(msg.tool_calls).toHaveLength(1)
    expect(msg.tool_calls[0]).toMatchObject({
      id: 'call1',
      type: 'function',
      function: { name: 'search', arguments: '{"q":"cats"}' },
    })
  })

  test('converts tool result messages', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: 'call1', toolName: 'search', output: { results: [] } as any },
        ],
      },
    ]
    const result = convertToLitellmChatMessages(prompt)
    expect(result).toEqual([
      { role: 'tool', tool_call_id: 'call1', content: '{"results":[]}' },
    ])
  })

  test('multiple tool results produce one message each', () => {
    const prompt: LanguageModelV2Prompt = [
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: 'c1', toolName: 'a', output: 'r1' as any },
          { type: 'tool-result', toolCallId: 'c2', toolName: 'b', output: 'r2' as any },
        ],
      },
    ]
    const result = convertToLitellmChatMessages(prompt)
    expect(result).toHaveLength(2)
    expect((result[0] as any).tool_call_id).toBe('c1')
    expect((result[1] as any).tool_call_id).toBe('c2')
  })
})

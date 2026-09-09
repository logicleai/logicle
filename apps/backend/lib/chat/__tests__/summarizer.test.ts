import { describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'
import type * as dto from '@/types/dto'

vi.mock('@/lib/models', () => ({ llmModels: [] }))
vi.mock('@/models/backend', () => ({ getBackends: vi.fn().mockResolvedValue([]) }))
vi.mock('@/backend/lib/chat/provider-factory', () => ({ createLanguageModel: vi.fn() }))

const { generateAndSendSummary } = await import('@/backend/lib/chat/summarizer')

const summaryModel = () => {
  const calls: LanguageModelV3CallOptions[] = []
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      calls.push(options)
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'text-start', id: 'text-1' })
            controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'Sala moderna' })
            controller.enqueue({ type: 'text-end', id: 'text-1' })
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            })
            controller.close()
          },
        }),
      }
    },
  })
  return { model: model as unknown as LanguageModelV3, calls }
}

describe('generateAndSendSummary', () => {
  it('summarizes the final assistant response after intermediate tool messages', async () => {
    const userMessage: dto.UserMessage = {
      id: 'user-1',
      conversationId: 'conversation-1',
      parent: null,
      sentAt: '2026-09-09T10:00:00.000Z',
      role: 'user',
      content: '',
      attachments: [
        { id: 'image-1', name: 'pasted image', mimetype: 'image/png', size: 42 },
      ],
    }
    const intermediateAssistantMessage: dto.AssistantMessage = {
      id: 'assistant-tool-call',
      conversationId: 'conversation-1',
      parent: 'user-1',
      sentAt: '2026-09-09T10:00:01.000Z',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          toolCallId: 'tool-call-1',
          toolName: 'inspect_image',
          args: {},
        },
      ],
    }
    const toolMessage: dto.ToolMessage = {
      id: 'tool-1',
      conversationId: 'conversation-1',
      parent: 'assistant-tool-call',
      sentAt: '2026-09-09T10:00:02.000Z',
      role: 'tool',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'tool-call-1',
          toolName: 'inspect_image',
          result: { type: 'text', value: 'A modern dining room' },
        },
      ],
    }
    const finalAssistantMessage: dto.AssistantMessage = {
      id: 'assistant-final',
      conversationId: 'conversation-1',
      parent: 'tool-1',
      sentAt: '2026-09-09T10:00:03.000Z',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Questa è una sala da pranzo moderna.' }],
    }
    const { model, calls } = summaryModel()
    const updateChatTitle = vi.fn()
    const enqueue = vi.fn()

    await generateAndSendSummary(
      [userMessage, intermediateAssistantMessage, toolMessage, finalAssistantMessage],
      model,
      'it',
      updateChatTitle,
      enqueue
    )

    const summaryPrompt = calls[0]!.prompt.find((message) => message.role === 'user')
    const promptText =
      summaryPrompt?.content[0]?.type === 'text' ? summaryPrompt.content[0].text : ''
    const summarizedMessages = JSON.parse(promptText) as dto.Message[]
    expect(summarizedMessages.map((message) => message.id)).toEqual([
      'user-1',
      'assistant-final',
    ])
    expect(promptText).toContain('Questa è una sala da pranzo moderna.')
    expect(promptText).not.toContain('assistant-tool-call')
    expect(calls).toHaveLength(1)
    expect(updateChatTitle).toHaveBeenCalledTimes(1)
    expect(updateChatTitle).toHaveBeenCalledWith('Sala moderna')
    expect(enqueue).toHaveBeenCalledWith({ type: 'summary', summary: 'Sala moderna' })
  })
})

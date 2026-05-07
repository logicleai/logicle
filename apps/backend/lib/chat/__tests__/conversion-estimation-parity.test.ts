import { describe, expect, test } from 'vitest'
import * as dto from '@/types/dto'
import { stockModels } from '@/lib/chat/models'
import { dtoMessageToLlmMessage } from '@/backend/lib/chat/conversion'
import { projectMessageForEstimation } from '@/backend/lib/chat/message-projection'
import { countModelMessageTokens } from '@/backend/lib/chat/prompt-token-counter'
import { estimateConversationWindowTokens } from '@/backend/lib/chat/token-estimator'

const base = {
  conversationId: 'conv-1',
  parent: null,
  sentAt: '2026-05-07T00:00:00.000Z',
} as const

const approxModel =
  stockModels.find((model) => model.tokenizer === 'approx_4chars') ?? stockModels[0]

if (!approxModel) {
  throw new Error('No stock model available for tests')
}

describe('message projection parity', () => {
  test('projects user metadata and attachment descriptor text', () => {
    const message: dto.UserMessage = {
      ...base,
      id: 'u-1',
      role: 'user',
      content: 'hello',
      metadata: { locale: 'en-US' },
      attachments: [{ id: 'f-1', name: 'a.pdf', mimetype: 'application/pdf', size: 42 }],
    }

    const projected = projectMessageForEstimation(message)
    expect(projected.role).toBe('user')
    if (projected.role !== 'user') return
    expect(projected.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'text', source: 'metadata' }),
        expect.objectContaining({ kind: 'text', source: 'content', text: 'hello' }),
        expect.objectContaining({ kind: 'text', source: 'attachment_descriptor' }),
        expect.objectContaining({ kind: 'attachment' }),
      ])
    )
  })

  test('projects assistant reasoning only when signature exists and keeps tool call payload', () => {
    const message: dto.AssistantMessage = {
      ...base,
      id: 'a-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Answer' },
        { type: 'reasoning', reasoning: 'hidden-no-signature' },
        { type: 'reasoning', reasoning: 'hidden-with-signature', reasoning_signature: 'sig-1' },
        { type: 'tool-call', toolCallId: 'tc-1', toolName: 'search', args: { q: 'x' } },
      ],
    }

    const projected = projectMessageForEstimation(message)
    expect(projected.role).toBe('assistant')
    if (projected.role !== 'assistant') return
    expect(projected.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'text', source: 'assistant_text', text: 'Answer' }),
        expect.objectContaining({
          kind: 'text',
          source: 'assistant_reasoning',
          text: 'hidden-with-signature',
          reasoningSignature: 'sig-1',
        }),
        expect.objectContaining({
          kind: 'tool_call',
          toolCallId: 'tc-1',
          toolName: 'search',
          payload: { toolCallId: 'tc-1', toolName: 'search', input: { q: 'x' } },
        }),
      ])
    )
    expect(
      projected.items.find(
        (item) =>
          item.kind === 'text' &&
          item.source === 'assistant_reasoning' &&
          item.text === 'hidden-no-signature'
      )
    ).toBeUndefined()
  })

  test('runtime conversion keeps signed reasoning and tool/result projections aligned', async () => {
    const assistantMessage: dto.AssistantMessage = {
      ...base,
      id: 'a-2',
      role: 'assistant',
      parts: [
        { type: 'reasoning', reasoning: 'reasoning', reasoning_signature: 'sig-2' },
        { type: 'tool-call', toolCallId: 'tc-2', toolName: 'math', args: { x: 1 } },
      ],
    }
    const toolMessage: dto.ToolMessage = {
      ...base,
      id: 't-1',
      role: 'tool',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'tc-2',
          toolName: 'math',
          result: { type: 'text', value: '1' },
        },
      ],
    }

    const assistantLlm = await dtoMessageToLlmMessage(
      assistantMessage,
      approxModel.capabilities,
      approxModel.provider
    )
    const toolLlm = await dtoMessageToLlmMessage(toolMessage, approxModel.capabilities, approxModel.provider)

    expect(assistantLlm?.role).toBe('assistant')
    expect(toolLlm?.role).toBe('tool')
    if (!assistantLlm || !toolLlm || assistantLlm.role !== 'assistant' || toolLlm.role !== 'tool') return
    expect(assistantLlm.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'reasoning', text: 'reasoning' }),
        expect.objectContaining({ type: 'tool-call', toolCallId: 'tc-2', toolName: 'math' }),
      ])
    )
    expect(toolLlm.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool-result', toolCallId: 'tc-2', toolName: 'math' }),
      ])
    )
  })
})

describe('token invariant for non-file history', () => {
  test('estimated history tokens equal runtime-projected message token sum', async () => {
    const history: dto.Message[] = [
      {
        ...base,
        id: 'u-2',
        role: 'user',
        content: 'Question?',
        metadata: { ui: 'chat' },
        attachments: [],
      },
      {
        ...base,
        id: 'a-3',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Answer.' },
          { type: 'reasoning', reasoning: 'private', reasoning_signature: 'sig-3' },
          { type: 'tool-call', toolCallId: 'tc-3', toolName: 'search', args: { q: 'abc' } },
        ],
      },
      {
        ...base,
        id: 't-2',
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'tc-3',
            toolName: 'search',
            result: { type: 'json', value: { ok: true } },
          },
        ],
      },
    ]

    const estimate = await estimateConversationWindowTokens({
      assistantParams: {
        assistantId: 'asst-1',
        model: approxModel.id,
        systemPrompt: '',
        temperature: 0,
        tokenLimit: 100000,
        reasoning_effort: null,
      },
      model: approxModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history,
      draft: null,
    })

    const llmMessages = (
      await Promise.all(
        history.map((message) =>
          dtoMessageToLlmMessage(message, approxModel.capabilities, approxModel.provider)
        )
      )
    ).filter((m): m is NonNullable<typeof m> => Boolean(m))

    let runtimeHistoryTokens = 0
    for (const llmMessage of llmMessages) {
      runtimeHistoryTokens += await countModelMessageTokens(approxModel, llmMessage)
    }

    expect(estimate.estimate.history).toBe(runtimeHistoryTokens)
  })
})

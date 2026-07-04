import { describe, expect, test, vi } from 'vitest'
import * as dto from '@/types/dto'
import { stockModels } from '@/lib/chat/models'
import { dtoMessageToLlmMessage } from '@/backend/lib/chat/conversion'
import { projectMessageForEstimation } from '@/backend/lib/chat/message-projection'
import { countModelMessageTokens } from '@/backend/lib/chat/prompt-token-counter'
import {
  estimateConversationWindowTokens,
  prepareConversationCostPlan,
  selectOptimalHistoryStartIndex,
} from '@/backend/lib/chat/token-estimator'

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7cAAAAASUVORK5CYII='

vi.mock('@/models/file', () => ({
  getFileWithId: async (id: string) => {
    const isPdf = id.includes('pdf')
    const isImage = id.includes('img')
    return {
      id,
      fileBlobId: `blob-${id}`,
      name: isPdf ? `mock-${id}.pdf` : isImage ? `mock-${id}.png` : `mock-${id}.txt`,
      type: isPdf ? 'application/pdf' : isImage ? 'image/png' : 'text/plain',
      path: '/tmp/mock-file.txt',
      encryption: null,
      size: 12,
    }
  },
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    readBuffer: async () => Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'),
  },
}))

vi.mock('@/lib/file-analysis', () => ({
  ensureFileAnalysis: async (file: { id: string; type: string }) => {
    if (file.type === 'application/pdf') {
      const pageCount = file.id.includes('over-limit') ? 10 : 2
      return {
        fileId: file.id,
        kind: 'pdf',
        status: 'ready',
        analyzerVersion: 1,
        payload: {
          kind: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          pageCount,
          visionPageCount: 1,
          textCharCount: 20,
          hasExtractableText: true,
          imagePageCount: 0,
          contentMode: 'text',
          extractedTextPath: null,
        },
        warnings: [],
        error: null,
        createdAt: '2026-05-07T00:00:00.000Z',
        updatedAt: '2026-05-07T00:00:00.000Z',
      }
    }
    return {
      fileId: file.id,
      kind: 'image',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'image',
        mimeType: file.type,
        sizeBytes: 100,
        width: 1,
        height: 1,
        frameCount: 1,
        hasAlpha: false,
        format: 'png',
        extractedTextPath: null,
      },
      warnings: [],
      error: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    }
  },
  ensureFileAnalysisForFile: async (file: { id: string; type: string }) => {
    if (file.type === 'application/pdf') {
      const pageCount = file.id.includes('over-limit') ? 10 : 2
      return {
        fileId: file.id,
        kind: 'pdf',
        status: 'ready',
        analyzerVersion: 1,
        payload: {
          kind: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          pageCount,
          visionPageCount: 1,
          textCharCount: 20,
          hasExtractableText: true,
          imagePageCount: 0,
          contentMode: 'text',
          extractedTextPath: null,
        },
        warnings: [],
        error: null,
        createdAt: '2026-05-07T00:00:00.000Z',
        updatedAt: '2026-05-07T00:00:00.000Z',
      }
    }
    return {
      fileId: file.id,
      kind: 'image',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'image',
        mimeType: file.type,
        sizeBytes: 100,
        width: 1,
        height: 1,
        frameCount: 1,
        hasAlpha: false,
        format: 'png',
        extractedTextPath: null,
      },
      warnings: [],
      error: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    }
  },
  isReadyFileAnalysis: (analysis: { status: string }) => analysis.status === 'ready',
  readExtractedTextFromAnalysis: async () => 'mock pdf extracted text',
}))

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

const parityMediaModel = {
  ...approxModel,
  owned_by: 'openai',
  tokenizer: 'approx_4chars',
  capabilities: {
    ...approxModel.capabilities,
    vision: true,
    supportedMedia: ['application/pdf'],
    nativePdfPageLimit: 3,
  },
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

  test('tool result content with files includes attached_files descriptor and remains estimable', async () => {
    const toolMessage: dto.ToolMessage = {
      ...base,
      id: 't-3',
      role: 'tool',
      parts: [
        {
          type: 'tool-result',
          toolCallId: 'tc-4',
          toolName: 'knowledge',
          result: {
            type: 'content',
            value: [
              { type: 'text', text: 'summary' },
              { type: 'file', id: 'file-1', mimetype: 'text/plain', name: 'doc.txt', size: 100 },
            ],
          },
        },
      ],
    }

    const projected = projectMessageForEstimation(toolMessage)
    expect(projected.role).toBe('tool')
    if (projected.role !== 'tool') return
    expect(projected.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'tool_result',
          toolCallId: 'tc-4',
          toolName: 'knowledge',
        }),
      ])
    )

    const llm = await dtoMessageToLlmMessage(toolMessage, approxModel.capabilities, 'litellm')
    expect(llm?.role).toBe('tool')
    if (llm?.role !== 'tool') return
    const content = llm.content
    expect(content[0]).toEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'tc-4',
        toolName: 'knowledge',
      })
    )
    const toolResultPart = content.find((part) => part.type === 'tool-result')
    const output = toolResultPart?.output
    expect(output && typeof output === 'object' ? (output as any).type : undefined).toBe('content')
    const outputParts = output && typeof output === 'object' && 'value' in output ? (output as any).value : []
    // [text 'summary', descriptor for doc.txt, file part]
    expect(outputParts[0]).toEqual(expect.objectContaining({ type: 'text', text: 'summary' }))
    expect(outputParts[1]).toEqual(expect.objectContaining({ type: 'text' }))
    expect(String(outputParts[1]?.text ?? '')).toContain('doc.txt')
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
        contextCompression: null,
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

  test('ignored user-request/user-response messages contribute zero in both projection and estimate', async () => {
    const history: dto.Message[] = [
      {
        ...base,
        id: 'r-1',
        role: 'user-request',
        request: {
          type: 'tool-call-authorization',
          toolCallId: 'tc-9',
          toolName: 'x',
          args: {},
        },
      },
      {
        ...base,
        id: 'r-2',
        role: 'user-response',
        allow: true,
      },
      {
        ...base,
        id: 'u-9',
        role: 'user',
        content: 'only this counts',
        attachments: [],
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
        contextCompression: null,
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
    expect(llmMessages).toHaveLength(1)
    const runtimeTokens = await countModelMessageTokens(approxModel, llmMessages[0]!)
    expect(estimate.estimate.history).toBe(runtimeTokens)
  })

  test('native image attachment path stays parity-aligned', async () => {
    const history: dto.Message[] = [
      {
        ...base,
        id: 'u-img',
        role: 'user',
        content: 'image',
        attachments: [{ id: 'img-1', name: 'img.png', mimetype: 'image/png', size: 100 }],
      },
    ]
    const estimate = await estimateConversationWindowTokens({
      assistantParams: {
        assistantId: 'asst-1',
        model: parityMediaModel.id,
        systemPrompt: '',
        temperature: 0,
        tokenLimit: 100000,
        reasoning_effort: null,
        contextCompression: null,
      },
      model: parityMediaModel as any,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history,
      draft: null,
    })
    const llm = await dtoMessageToLlmMessage(history[0]!, parityMediaModel.capabilities as any, 'openai')
    expect(llm?.role).toBe('user')
    const runtimeTokens = llm ? await countModelMessageTokens(parityMediaModel as any, llm) : 0
    expect(estimate.estimate.history).toBe(runtimeTokens)
  })

  test('pdf over native page limit uses text notice parity path', async () => {
    const history: dto.Message[] = [
      {
        ...base,
        id: 'u-pdf',
        role: 'user',
        content: 'pdf',
        attachments: [
          {
            id: 'pdf-over-limit-1',
            name: 'mock-pdf-over-limit-1.pdf',
            mimetype: 'application/pdf',
            size: 100,
          },
        ],
      },
    ]
    const estimate = await estimateConversationWindowTokens({
      assistantParams: {
        assistantId: 'asst-1',
        model: parityMediaModel.id,
        systemPrompt: '',
        temperature: 0,
        tokenLimit: 100000,
        reasoning_effort: null,
        contextCompression: null,
      },
      model: parityMediaModel as any,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history,
      draft: null,
    })
    const llm = await dtoMessageToLlmMessage(history[0]!, parityMediaModel.capabilities as any, 'openai')
    expect(llm?.role).toBe('user')
    const runtimeTokens = llm ? await countModelMessageTokens(parityMediaModel as any, llm) : 0
    expect(estimate.estimate.history).toBe(runtimeTokens)
  })
})

describe('truncation correctness', () => {
  const buildTurns = (turns: number): dto.Message[] => {
    const messages: dto.Message[] = []
    for (let i = 1; i <= turns; i++) {
      messages.push({
        ...base,
        id: `u-turn-${i}`,
        role: 'user',
        content: `user turn ${i} question with some text`,
        attachments: [],
      })
      messages.push({
        ...base,
        id: `a-turn-${i}`,
        role: 'assistant',
        parts: [{ type: 'text', text: `assistant turn ${i} answer with some text` }],
      })
    }
    return messages
  }

  const buildBaseAssistantParams = (systemPrompt: string) => ({
    assistantId: 'asst-truncate',
    model: approxModel.id,
    systemPrompt,
    temperature: 0,
    tokenLimit: 100000,
    reasoning_effort: null,
    contextCompression: null,
  })

  const truncateLengthFor = async (systemPrompt: string, tokenLimit: number) => {
    const history = buildTurns(10)
    const planResult = await prepareConversationCostPlan({
      assistantParams: {
        ...buildBaseAssistantParams(systemPrompt),
        tokenLimit,
      },
      model: approxModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history,
      draft: null,
    })
    const startIndex = selectOptimalHistoryStartIndex(
      history,
      planResult.plan.historyMessageCosts,
      planResult.plan.assistantTokens,
      planResult.plan.draftTokens,
      tokenLimit
    )
    return history.slice(startIndex).length
  }

  test('without extra preamble can keep 10/20 messages', async () => {
    const kept = await truncateLengthFor('', 180)
    expect(kept).toBe(10)
  })

  test('with huge preamble can keep 2/20 messages under same budget', async () => {
    const kept = await truncateLengthFor('HUGE PROMPT '.repeat(5000), 180)
    expect(kept).toBe(2)
  })
})

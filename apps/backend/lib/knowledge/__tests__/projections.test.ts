import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import type { LanguageModelV3, LanguageModelV3GenerateResult } from '@ai-sdk/provider'

vi.mock('@/lib/models', () => ({ llmModels: [] }))
vi.mock('@/models/backend', () => ({ getBackends: vi.fn().mockResolvedValue([]) }))
vi.mock('@/backend/lib/chat/provider-factory', () => ({ createLanguageModel: vi.fn() }))
vi.mock('@/backend/lib/chat/summarizer', () => ({
  findReasonableSummarizationBackend: vi.fn().mockResolvedValue(undefined),
}))

const { NO_ANSWER, answerQuestion, computeProjections } = await import(
  '@/backend/lib/knowledge/projections'
)

const question = { id: 'q1', title: 'Topics', prompt: 'What is this about?' }

interface RecordedCall {
  system: string
  user: string
}

/**
 * A real `LanguageModelV3` returning canned answers, so the test exercises the actual
 * `ai.generateText` call rather than a stub of it.
 */
const mockModel = (answers: string[]) => {
  const calls: RecordedCall[] = []
  let index = 0
  const model = new MockLanguageModelV3({
    doGenerate: async ({ prompt }): Promise<LanguageModelV3GenerateResult> => {
      const system = prompt.find((message) => message.role === 'system')
      const user = prompt.find((message) => message.role === 'user')
      calls.push({
        system: typeof system?.content === 'string' ? system.content : '',
        user: Array.isArray(user?.content)
          ? user.content.map((part) => ('text' in part ? part.text : '')).join('')
          : '',
      })
      return {
        content: [{ type: 'text' as const, text: answers[index++] ?? '' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      }
    },
  })
  return { model: model as unknown as LanguageModelV3, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('answerQuestion', () => {
  it('asks once for a document that fits in one window, and trims the answer', async () => {
    const { model, calls } = mockModel(['  It is about invoices.  '])
    expect(await answerQuestion(model, 'contract.pdf', 'short text', question)).toBe(
      'It is about invoices.'
    )
    expect(calls).toHaveLength(1)
  })

  it('returns null when the document does not answer the question', async () => {
    const { model } = mockModel([NO_ANSWER])
    expect(await answerQuestion(model, 'contract.pdf', 'short text', question)).toBeNull()
  })

  it('includes the file name, the question and the document text in the prompt', async () => {
    const { model, calls } = mockModel(['Invoices.'])
    await answerQuestion(model, 'contract.pdf', 'body text', question)
    expect(calls[0]!.system).toContain('contract.pdf')
    expect(calls[0]!.system).toContain(NO_ANSWER)
    expect(calls[0]!.user).toContain('What is this about?')
    expect(calls[0]!.user).toContain('body text')
  })

  it('maps over windows and reduces the partial answers for a long document', async () => {
    const { model, calls } = mockModel(['Part one.', 'Part two.', 'Merged answer.'])
    expect(await answerQuestion(model, 'big.pdf', 'x'.repeat(90_000), question)).toBe(
      'Merged answer.'
    )
    expect(calls).toHaveLength(3)
    expect(calls[0]!.user).toContain('Part 1 of 2')
    expect(calls[2]!.user).toContain('Part one.')
    expect(calls[2]!.user).toContain('Part two.')
  })

  it('skips the reduce pass when only one window answered', async () => {
    const { model, calls } = mockModel([NO_ANSWER, 'Only this part answers.'])
    expect(await answerQuestion(model, 'big.pdf', 'x'.repeat(90_000), question)).toBe(
      'Only this part answers.'
    )
    expect(calls).toHaveLength(2)
  })

  it('returns null when no window answered', async () => {
    const { model, calls } = mockModel([NO_ANSWER, NO_ANSWER])
    expect(await answerQuestion(model, 'big.pdf', 'x'.repeat(90_000), question)).toBeNull()
    expect(calls).toHaveLength(2)
  })

  it('returns null when the reduce pass finds nothing', async () => {
    const { model } = mockModel(['Part one.', 'Part two.', NO_ANSWER])
    expect(await answerQuestion(model, 'big.pdf', 'x'.repeat(90_000), question)).toBeNull()
  })

  it('accumulates token usage across map and reduce passes', async () => {
    const { emptyProjectionUsage } = await import('@/backend/lib/knowledge/projections')
    const usage = emptyProjectionUsage()
    const { model } = mockModel(['Part one.', 'Part two.', 'Merged answer.'])
    await answerQuestion(model, 'big.pdf', 'x'.repeat(90_000), question, usage)
    // The mock reports 1 input and 1 output token per call; three calls were made.
    expect(usage).toEqual({
      inputTokens: 3,
      outputTokens: 3,
      calls: 3,
      providerUsages: [
        {
          inputTokens: 1,
          outputTokens: 1,
          inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
        {
          inputTokens: 1,
          outputTokens: 1,
          inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
        {
          inputTokens: 1,
          outputTokens: 1,
          inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
      ],
    })
  })

  it('caps the number of windows for an absurdly large document', async () => {
    const { model, calls } = mockModel(Array(40).fill('Something.'))
    await answerQuestion(model, 'huge.pdf', 'x'.repeat(60_000 * 30), question)
    // 12 map passes plus one reduce.
    expect(calls).toHaveLength(13)
  })
})

describe('computeProjections', () => {
  it('does not resolve a model when there are no questions', async () => {
    const { findReasonableSummarizationBackend } = await import('@/backend/lib/chat/summarizer')
    const result = await computeProjections('contract.pdf', 'text', [])
    expect(result.projections).toEqual([])
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, calls: 0, providerUsages: [] })
    expect(findReasonableSummarizationBackend).not.toHaveBeenCalled()
  })

  it('returns nothing when no backend is configured', async () => {
    const result = await computeProjections('contract.pdf', 'text', [question])
    expect(result.projections).toEqual([])
    expect(result.usage.calls).toBe(0)
  })

  it('records the model that incurred projection usage', async () => {
    const { findReasonableSummarizationBackend } = await import('@/backend/lib/chat/summarizer')
    const { model } = mockModel(['Invoices.'])
    vi.mocked(findReasonableSummarizationBackend).mockResolvedValue(model)

    const result = await computeProjections('contract.pdf', 'text', [question])

    expect(result.usage.modelId).toBe(model.modelId)
  })
})

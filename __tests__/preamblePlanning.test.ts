import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { LlmModel } from '@/lib/chat/models'

const { mockKnowledgeToInputPart } = vi.hoisted(() => ({
  mockKnowledgeToInputPart: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  default: {
    knowledge: { sendInPrompt: true },
  },
}))

vi.mock('@/backend/lib/tools/knowledge/implementation', () => ({
  KnowledgePlugin: class KnowledgePlugin {
    toolParams = { id: 'knowledge', provisioned: false, promptFragment: '', name: 'knowledge' }
    params: unknown = {}
    constructor(toolParams: unknown, params: unknown) {
      this.toolParams = toolParams as typeof this.toolParams
      this.params = params
    }
    async knowledgeToInputPart(...args: unknown[]) {
      return mockKnowledgeToInputPart(...args)
    }
  },
}))

vi.mock('@/backend/lib/chat/conversion', () => ({
  dtoMessageToLlmMessage: vi.fn(),
  sanitizeOrphanToolCalls: (messages: unknown[]) => messages,
}))

describe('preamble planning and rendering', () => {
  const llmModel = {
    id: 'gpt-4.1-mini',
    capabilities: { knowledge: true, vision: true, supportedMedia: ['image/png'] },
  } as unknown as LlmModel

  beforeEach(() => {
    vi.clearAllMocks()
    mockKnowledgeToInputPart.mockResolvedValue({ type: 'text', text: 'knowledge content' })
  })

  test('preparePreamblePlan stays lightweight and does not materialize knowledge parts', async () => {
    const { preparePreamblePlan } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams: { systemPrompt: 'system prompt' },
      llmModel,
      tools: [],
      parameters: {},
      knowledge: [{ id: 'k1', name: 'k1.png', type: 'image/png', size: 1 }],
    })

    expect(plan.knowledgeFileEntries).toEqual([
      { fileId: 'k1', fileName: 'k1.png', mimetype: 'image/png', partIndex: 0 },
    ])
    expect(mockKnowledgeToInputPart).not.toHaveBeenCalled()
  })

  test('buildEstimatedPreambleSegments stays lightweight without materialization', async () => {
    const { preparePreamblePlan, buildEstimatedPreambleSegments } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams: { systemPrompt: 'system prompt' },
      llmModel,
      tools: [],
      parameters: {},
      knowledge: [{ id: 'k1', name: 'k1.png', type: 'image/png', size: 1 }],
    })

    const segments = buildEstimatedPreambleSegments(plan)

    expect(segments).toHaveLength(2)
    expect(segments[1]?.message).toEqual({ role: 'user', content: [] })
    expect(segments[1]?.knowledgeFileEntries).toEqual([
      { fileId: 'k1', fileName: 'k1.png', mimetype: 'image/png', partIndex: 0 },
    ])
    expect(mockKnowledgeToInputPart).not.toHaveBeenCalled()
  })

  test('renderPreamblePlan materializes knowledge parts for real model rendering', async () => {
    const { preparePreamblePlan, renderPreamblePlan } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams: { systemPrompt: 'system prompt' },
      llmModel,
      tools: [],
      parameters: {},
      knowledge: [{ id: 'k1', name: 'k1.png', type: 'image/png', size: 1 }],
    })

    const segments = await renderPreamblePlan(plan)

    expect(segments).toHaveLength(2)
    expect(mockKnowledgeToInputPart).toHaveBeenCalledTimes(1)
    expect(segments[1]?.message).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'knowledge content' }],
    })
  })

  test('lightweight path stays non-materializing with many knowledge files', async () => {
    const { preparePreamblePlan, buildEstimatedPreambleSegments } = await import('@/backend/lib/chat/preamble')
    const knowledgeFiles = Array.from({ length: 200 }, (_, i) => ({
      id: `k${i + 1}`,
      name: `k${i + 1}.png`,
      type: 'image/png',
      size: i + 1,
    }))
    const plan = await preparePreamblePlan({
      assistantParams: { systemPrompt: 'system prompt' },
      llmModel,
      tools: [],
      parameters: {},
      knowledge: knowledgeFiles,
    })

    const segments = buildEstimatedPreambleSegments(plan)

    expect(segments).toHaveLength(2)
    expect(segments[1]?.message).toEqual({ role: 'user', content: [] })
    expect(segments[1]?.knowledgeFileEntries).toHaveLength(200)
    expect(mockKnowledgeToInputPart).not.toHaveBeenCalled()
  })

})

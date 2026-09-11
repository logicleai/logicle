import { beforeEach, describe, expect, test, vi } from 'vitest'
import type * as dto from '@/types/dto'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunctions, ToolImplementation } from '@/lib/chat/tools'

const { mockApplyCompressionPlan, mockEstimateHistoryMessageCosts } = vi.hoisted(() => ({
  mockApplyCompressionPlan: vi.fn(),
  mockEstimateHistoryMessageCosts: vi.fn(),
}))

vi.mock('@/backend/lib/chat/compression-planner', () => ({
  applyCompressionPlan: mockApplyCompressionPlan,
}))

vi.mock('@/backend/lib/chat/token-estimator', () => ({
  estimateHistoryMessageCosts: mockEstimateHistoryMessageCosts,
}))

import {
  buildCostEffectiveCompressionPlan,
  MIN_COMPRESSION_MESSAGE_SAVINGS_TOKENS,
  MIN_COMPRESSION_PLAN_SAVINGS_TOKENS,
  selectCompressionPromptCapabilities,
} from '@/backend/lib/chat/compression-economics'

const model = {} as LlmModel
const application = {}

const message = (id: string, content = id): dto.UserMessage => ({
  id,
  role: 'user',
  content,
  attachments: [],
  conversationId: 'conversation',
  parent: null,
  sentAt: '2026-09-11T00:00:00.000Z',
})

const decision = (
  messageId: string,
  policy: dto.MessageCompressionDecision['policy'],
  reason = policy === 'summary' ? 'candidate summary' : 'kept full'
): dto.MessageCompressionDecision => ({
  messageId,
  policy,
  reason,
  estimatedTokensBefore: 0,
  estimatedTokensAfter: 0,
})

const costs = (
  ...entries: Array<[string, number]>
): Array<{
  messageId: string
  role: dto.Message['role']
  tokens: number
}> => entries.map(([messageId, tokens]) => ({ messageId, role: 'user', tokens }))

beforeEach(() => {
  vi.clearAllMocks()
  mockApplyCompressionPlan.mockImplementation(
    async (
      messages: dto.Message[],
      decisions: dto.MessageCompressionDecision[],
      options?: { attachmentContinuationQuery?: string }
    ) =>
      messages.map((current) => {
        const selected = decisions.find((candidate) => candidate.messageId === current.id)
        if (selected?.policy === 'summary' && current.role === 'user') {
          return { ...current, content: `summary:${current.id}` }
        }
        if (
          options?.attachmentContinuationQuery?.trim() &&
          current.role === 'user' &&
          !current.content.trim() &&
          current.attachments.length > 0
        ) {
          return {
            ...current,
            content: `[CONVERSATION CONTINUATION] ${options.attachmentContinuationQuery}`,
          }
        }
        return current
      })
  )
  mockEstimateHistoryMessageCosts.mockImplementation(
    async (_model: LlmModel, messages: dto.Message[]) =>
      messages.map((current) => ({
        messageId: current.id,
        role: current.role,
        tokens:
          (current.role === 'user' ? current.content : '') === 'summary:small'
            ? 50
            : (current.role === 'user' ? current.content : '').startsWith('summary:')
            ? 100
            : current.id === 'sibling-call' || current.id === 'small'
            ? 100
            : 300,
      }))
  )
})

describe('buildCostEffectiveCompressionPlan', () => {
  test('rejects an individual summary whose saving is below the per-message threshold', async () => {
    const messages = [message('small')]
    const result = await buildCostEffectiveCompressionPlan({
      messages,
      decisions: [decision('small', 'summary')],
      model,
      historyCostsBefore: costs(['small', MIN_COMPRESSION_MESSAGE_SAVINGS_TOKENS + 1]),
      application,
    })

    expect(result.applied).toBe(false)
    expect(result.messages).toEqual(messages)
    expect(result.decisions[0]).toMatchObject({ policy: 'full' })
    expect(result.decisions[0]?.reason).toContain('summary rejected')
  })

  test('returns original messages when no summary is selected', async () => {
    const messages = [message('full')]
    const originalDecision = decision('full', 'full', 'recent turn kept full')
    const result = await buildCostEffectiveCompressionPlan({
      messages,
      decisions: [originalDecision],
      model,
      historyCostsBefore: costs(['full', 300]),
      application,
    })

    expect(result).toMatchObject({
      messages,
      decisions: [originalDecision],
      historyCostsAfter: costs(['full', 300]),
      estimatedHistoryTokenReduction: 0,
      applied: false,
    })
  })

  test('keeps an attachment continuation annotation and coherent costs when no summary survives', async () => {
    const messages: dto.UserMessage[] = [
      {
        ...message('attachment-turn', ''),
        attachments: [{ id: 'file-1', name: 'notes.txt', mimetype: 'text/plain', size: 12 }],
      },
    ]
    const attachmentContinuationQuery = 'What does this file say?'
    const result = await buildCostEffectiveCompressionPlan({
      messages,
      decisions: [decision('attachment-turn', 'full', 'attachment continuation')],
      model,
      historyCostsBefore: costs(['attachment-turn', 300]),
      application: { attachmentContinuationQuery },
    })

    expect(result.applied).toBe(false)
    expect(result.messages[0]).toMatchObject({
      id: 'attachment-turn',
      content: `[CONVERSATION CONTINUATION] ${attachmentContinuationQuery}`,
    })
    expect(result.historyCostsAfter).toEqual(costs(['attachment-turn', 300]))
    expect(result.estimatedHistoryTokenReduction).toBe(0)
    expect(mockApplyCompressionPlan).toHaveBeenLastCalledWith(messages, expect.any(Array), {
      attachmentContinuationQuery,
    })
  })

  test('applies a plan whose total saving reaches the plan threshold', async () => {
    const messages = [message('first'), message('second')]
    const result = await buildCostEffectiveCompressionPlan({
      messages,
      decisions: [decision('first', 'summary'), decision('second', 'summary')],
      model,
      historyCostsBefore: costs(['first', 292], ['second', 292]),
      application,
    })

    expect(result.applied).toBe(true)
    expect(result.estimatedHistoryTokenReduction).toBe(MIN_COMPRESSION_PLAN_SAVINGS_TOKENS)
    expect(
      result.messages.map((current) => (current.role === 'user' ? current.content : undefined))
    ).toEqual(['summary:first', 'summary:second'])
  })

  test('rejects a plan below the total saving threshold and restores original messages', async () => {
    const messages = [message('first'), message('second')]
    const result = await buildCostEffectiveCompressionPlan({
      messages,
      decisions: [decision('first', 'summary'), decision('second', 'summary')],
      model,
      historyCostsBefore: costs(['first', 250], ['second', 250]),
      application,
    })

    expect(result.applied).toBe(false)
    expect(result.messages).toEqual(messages)
    expect(result.estimatedHistoryTokenReduction).toBe(0)
    expect(result.decisions.every((current) => current.policy === 'full')).toBe(true)
    expect(result.decisions.every((current) => Boolean(current.reason))).toBe(true)
  })

  test('preserves non-summary decisions while applying beneficial summaries', async () => {
    const messages = [message('summary-target'), message('decision')]
    const fullDecision = decision('decision', 'full', 'protected decision')
    const result = await buildCostEffectiveCompressionPlan({
      messages,
      decisions: [decision('summary-target', 'summary'), fullDecision],
      model,
      historyCostsBefore: costs(['summary-target', 500], ['decision', 300]),
      application,
    })

    expect(result.applied).toBe(true)
    expect(result.decisions[1]).toEqual(fullDecision)
    expect(result.messages[1]).toEqual(messages[1])
  })

  test('allows a tool summary whose saving is realized on its sibling tool-call', async () => {
    const messages: dto.Message[] = [
      {
        id: 'sibling-call',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            toolCallId: 'call-large-result',
            toolName: 'file-tool',
            args: { query: 'large result' },
          },
        ],
        conversationId: 'conversation',
        parent: null,
        sentAt: '2026-09-11T00:00:00.000Z',
      },
      {
        id: 'tool-result',
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call-large-result',
            toolName: 'file-tool',
            result: { type: 'text', value: 'large tool result' },
          },
        ],
        conversationId: 'conversation',
        parent: null,
        sentAt: '2026-09-11T00:00:00.000Z',
      },
    ]
    const result = await buildCostEffectiveCompressionPlan({
      messages,
      decisions: [decision('sibling-call', 'full'), decision('tool-result', 'summary')],
      model,
      historyCostsBefore: [
        { messageId: 'sibling-call', role: 'assistant', tokens: 500 },
        { messageId: 'tool-result', role: 'tool', tokens: 300 },
      ],
      application,
    })

    expect(result.applied).toBe(true)
    expect(result.estimatedHistoryTokenReduction).toBe(400)
    expect(result.decisions.find((current) => current.messageId === 'tool-result')).toMatchObject({
      policy: 'summary',
    })
  })
})

describe('selectCompressionPromptCapabilities', () => {
  const tool = (id: string): ToolImplementation => ({
    supportedMedia: [],
    toolParams: { id, name: id, provisioned: true, promptFragment: '' },
    functions: async () => ({}),
  })

  const capabilities = () => {
    const functions: ToolFunctions = {
      retrieveContext: {
        description: 'retrieve context',
        invoke: async () => ({ type: 'text', value: '' }),
      },
      inspectFile: {
        description: 'inspect a file',
        invoke: async () => ({ type: 'text', value: '' }),
      },
    }
    return {
      tools: [tool('context-retrieve'), tool('file-tools')],
      functions,
      functionToolIdMap: new Map([
        ['retrieveContext', 'context-retrieve'],
        ['inspectFile', 'file-tools'],
      ]),
    }
  }

  test('removes only context-retrieve tools and functions before compression is applied', () => {
    const input = capabilities()
    const result = selectCompressionPromptCapabilities({
      ...input,
      compressionConfigured: true,
      compressionApplied: false,
    })

    expect(result.tools.map((current) => current.toolParams.id)).toEqual(['file-tools'])
    expect(Object.keys(result.functions)).toEqual(['inspectFile'])
  })

  test('keeps all prompt capabilities once compression is applied', () => {
    const input = capabilities()
    const result = selectCompressionPromptCapabilities({
      ...input,
      compressionConfigured: true,
      compressionApplied: true,
    })

    expect(result.tools).toBe(input.tools)
    expect(result.functions).toBe(input.functions)
  })
})

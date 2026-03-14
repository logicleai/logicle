import { describe, expect, test } from 'vitest'
import {
  tokenizerForModel,
  countMessageTokens,
  countTextForModel,
  buildKnowledgePrompt,
  countAssistantBaseTokens,
} from '@/lib/chat/tokenizer'
import type { LlmModel } from '@/lib/chat/models'
import type * as dto from '@/types/dto'

// A model that uses the fast approx_4chars strategy (no WASM loading)
const approxModel: LlmModel = {
  id: 'claude-3',
  model: 'claude-3',
  name: 'Claude 3',
  provider: 'anthropic',
  owned_by: 'anthropic',
  description: '',
  context_length: 200000,
  capabilities: { vision: true, function_calling: true, reasoning: false },
}

// A model with explicit tokenizer override
const overrideModel: LlmModel = { ...approxModel, tokenizer: 'approx_4chars' }

const base = { conversationId: 'c1', sentAt: '2024-01-01T00:00:00.000Z', parent: null }

describe('tokenizerForModel', () => {
  test('returns approx_4chars for anthropic provider', () => {
    expect(tokenizerForModel(approxModel)).toBe('approx_4chars')
  })

  test('respects explicit tokenizer override on model', () => {
    const m: LlmModel = { ...approxModel, provider: 'openai', owned_by: 'openai', tokenizer: 'approx_4chars' }
    expect(tokenizerForModel(m)).toBe('approx_4chars')
  })
})

describe('countTextForModel (approx_4chars)', () => {
  test('counts ceil(length / 4) tokens', () => {
    expect(countTextForModel(approxModel, 'abcd')).toBe(1)   // 4/4 = 1
    expect(countTextForModel(approxModel, 'abcde')).toBe(2)  // ceil(5/4) = 2
    expect(countTextForModel(approxModel, '')).toBe(0)
  })
})

describe('countMessageTokens', () => {
  test('counts tokens in user message content', () => {
    const msg: dto.UserMessage = { ...base, id: 'm1', role: 'user', content: 'abcd', attachments: [] }
    expect(countMessageTokens(approxModel, msg)).toBe(1)
  })

  test('sums text parts in assistant message', () => {
    const msg: dto.AssistantMessage = {
      ...base,
      id: 'm2',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'abcd' },     // 1 token
        { type: 'text', text: 'efgh' },     // 1 token
        { type: 'reasoning', reasoning: 'thinking' }, // 0 tokens
      ],
    }
    expect(countMessageTokens(approxModel, msg)).toBe(2)
  })

  test('returns 0 for non-user/assistant messages', () => {
    const msg = { ...base, id: 'm3', role: 'tool', parts: [] } as unknown as dto.Message
    expect(countMessageTokens(approxModel, msg)).toBe(0)
  })
})

describe('buildKnowledgePrompt', () => {
  test('returns empty string when no knowledge files', () => {
    expect(buildKnowledgePrompt([])).toBe('')
  })

  test('includes file JSON when knowledge provided', () => {
    const file = { id: 'f1', name: 'doc.pdf', type: 'application/pdf', size: 1000 }
    const prompt = buildKnowledgePrompt([file as dto.AssistantFile])
    expect(prompt).toContain('f1')
    expect(prompt).toContain('doc.pdf')
  })
})

describe('countAssistantBaseTokens', () => {
  test('counts system prompt tokens', () => {
    // 8 chars / 4 = 2 tokens
    const tokens = countAssistantBaseTokens(approxModel, 'abcdefgh', [])
    expect(tokens).toBe(2)
  })

  test('includes knowledge prompt in count', () => {
    const withoutKnowledge = countAssistantBaseTokens(approxModel, 'abcd', [])
    const withKnowledge = countAssistantBaseTokens(approxModel, 'abcd', [
      { id: 'f1', name: 'doc.pdf', type: 'application/pdf', size: 1000 } as dto.AssistantFile,
    ])
    expect(withKnowledge).toBeGreaterThan(withoutKnowledge)
  })
})

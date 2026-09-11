import { describe, expect, it } from 'vitest'
import { llmModels } from '@/lib/models'

describe('OpenAI model catalog', () => {
  it('includes GPT-5.6 Luna for eval and normal model resolution', () => {
    expect(llmModels.find((model) => model.id === 'gpt-5.6-luna')).toMatchObject({
      id: 'gpt-5.6-luna',
      model: 'gpt-5.6-luna',
      provider: 'openai',
      owned_by: 'openai',
      context_length: 1_050_000,
      supportedReasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
      defaultReasoning: 'medium',
      maxOutputTokens: 128_000,
    })
  })
})

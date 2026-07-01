import { ProviderType } from '@/types/provider'
import { openaiModels } from './openai'
import { logicleModels } from './logicle'
import { anthropicModels } from './anthropic'
import { vertexModels } from './vertex'
import { perplexityModels } from './perplexity'
import { geminiModels } from './gemini'
import { mockModels } from './mock'

export const reasoningEffortValues = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ReasoningEffort = (typeof reasoningEffortValues)[number]

export interface LlmModelCapabilities {
  vision: boolean
  function_calling: boolean
  supportedMedia?: string[]
  web_search?: boolean
  knowledge?: boolean
  nativePdfPageLimit?: number
  promptCaching?: boolean
  temperature?: boolean
}

export const tokenizerStrategies = [
  'cl100k_base',
  'o200k_base',
  'approx_4chars',
  'anthropic_heuristic',
] as const
export type TokenizerStrategy = (typeof tokenizerStrategies)[number]

export const llmModelNoCapabilities: LlmModelCapabilities = {
  vision: false,
  function_calling: false,
  knowledge: false,
}

// This EngineOwner is currently used to enable "owner" specific APIs (read: reasoning) for LogicleCloud backends.
export type EngineOwner = 'openai' | 'perplexity' | 'anthropic' | 'google' | 'meta' | 'gemini'

type ModelTags = 'latest' | 'obsolete'

export interface LlmModel {
  id: string
  model: string
  name: string
  provider: ProviderType
  owned_by: EngineOwner
  description: string
  context_length: number
  capabilities: LlmModelCapabilities
  defaultReasoning?: ReasoningEffort
  supportedReasoningEfforts?: ReasoningEffort[]
  tags?: ModelTags[]
  maxOutputTokens?: number
  tokenizer?: TokenizerStrategy
}

export const defaultTokenizerByProvider = (provider: ProviderType): TokenizerStrategy => {
  switch (provider) {
    case 'openai':
    case 'perplexity':
    case 'logiclecloud':
      return 'cl100k_base'
    case 'anthropic':
      return 'anthropic_heuristic'
    case 'gcp-vertex':
    case 'google-ai-studio':
    case 'mock':
      return 'approx_4chars'
  }
}

export const defaultTokenizerByOwner = (owner: EngineOwner): TokenizerStrategy => {
  switch (owner) {
    case 'openai':
    case 'perplexity':
      return 'cl100k_base'
    case 'anthropic':
      return 'anthropic_heuristic'
    case 'google':
    case 'gemini':
    case 'meta':
      return 'approx_4chars'
  }
}

export const modelSupportsReasoning = (model: LlmModel): boolean =>
  (model.supportedReasoningEfforts?.length ?? 0) > 0

export const stockModels = [
  ...openaiModels,
  ...logicleModels,
  ...anthropicModels,
  ...vertexModels,
  ...perplexityModels,
  ...geminiModels,
  ...mockModels,
]

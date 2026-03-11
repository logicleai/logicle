import { ProviderType } from '@/types/provider'
import { openaiModels } from './openai'
import { logicleModels } from './logicle'
import { anthropicModels } from './anthropic'
import { vertexModels } from './vertex'
import { perplexityModels } from './perplexity'
import { ReasoningEffort } from '@/db/schema'
import { geminiModels } from './gemini'

export interface LlmModelCapabilities {
  vision: boolean
  function_calling: boolean
  reasoning: boolean
  supportedMedia?: string[]
  web_search?: boolean
  knowledge?: boolean
}

export const tokenizerStrategies = ['cl100k_base', 'o200k_base', 'approx_4chars'] as const
export type TokenizerStrategy = (typeof tokenizerStrategies)[number]

export const llmModelNoCapabilities: LlmModelCapabilities = {
  vision: false,
  function_calling: false,
  reasoning: false,
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
    case 'gcp-vertex':
    case 'gemini':
      return 'approx_4chars'
  }
}

export const stockModels = [
  ...openaiModels,
  ...logicleModels,
  ...anthropicModels,
  ...vertexModels,
  ...perplexityModels,
  ...geminiModels,
]

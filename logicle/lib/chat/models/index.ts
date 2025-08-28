import { ProviderType } from '@/types/provider'
import { openaiModels } from './openai'
import { logicleModels } from './logicle'
import { anthropicModels } from './anthropic'
import { vertexModels } from './vertex'
import { perplexityModels } from './perplexity'

export interface LlmModelCapabilities {
  vision: boolean
  function_calling: boolean
  reasoning: boolean
  supportedMedia?: string[]
}

export const llmModelNoCapabilities: LlmModelCapabilities = {
  vision: false,
  function_calling: false,
  reasoning: false,
}

// This EngineOwner is currently used to enable "owner" specific APIs (read: reasoning) for LogicleCloud backends.
export type EngineOwner = 'openai' | 'perplexity' | 'anthropic' | 'google' | 'meta'

export interface LlmModel {
  id: string
  name: string
  provider: ProviderType
  owned_by: EngineOwner
  description: string
  context_length: number
  capabilities: LlmModelCapabilities
}

export const stockModels = [
  ...openaiModels,
  ...logicleModels,
  ...anthropicModels,
  ...vertexModels,
  ...perplexityModels,
]

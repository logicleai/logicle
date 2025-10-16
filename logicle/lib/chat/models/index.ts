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
  knowledge?: boolean
}

export const llmModelNoCapabilities: LlmModelCapabilities = {
  vision: false,
  function_calling: false,
  reasoning: false,
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
}

export const stockModels = [
  ...openaiModels,
  ...logicleModels,
  ...anthropicModels,
  ...vertexModels,
  ...perplexityModels,
  ...geminiModels,
]

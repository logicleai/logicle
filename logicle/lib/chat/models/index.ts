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
}

// This EngineOwner is currently used to enable "owner" specific APIs (read: reasoning)
// in logicle mode.
export type EngineOwner = 'openai' | 'perplexity' | 'anthropic' | 'google' | 'meta' | 'mistral'

export interface LlmModel {
  id: string
  name: string
  owned_by: EngineOwner
  description: string
  context_length: number
  capabilities: LlmModelCapabilities
}

export function getModels(providerType: ProviderType): LlmModel[] {
  switch (providerType) {
    case 'openai':
      return openaiModels
    case 'logiclecloud':
      return logicleModels
    case 'anthropic':
      return anthropicModels
    case 'gcp-vertex':
      return vertexModels
    case 'perplexity':
      return perplexityModels
    default:
      return []
  }
}

export const allModels = [
  ...openaiModels,
  ...logicleModels,
  ...anthropicModels,
  ...vertexModels,
  ...perplexityModels,
]

export const isReasoningModel = (modelId: string) => {
  for (const model of allModels) {
    console.log(`comparing ${model.id} with ${modelId}`)
    if (model.id == modelId) {
      return model.capabilities.reasoning
    }
  }
  return false
}

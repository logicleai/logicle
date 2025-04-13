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

export const llmModelNoCapabilities: LlmModelCapabilities = {
  vision: false,
  function_calling: false,
  reasoning: false,
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
    if (model.id == modelId) {
      return model.capabilities.reasoning
    }
  }
  return false
}

export const isToolCallingModel = (modelId: string) => {
  for (const model of allModels) {
    if (model.id == modelId) {
      return model.capabilities.function_calling
    }
  }
  return false
}

export const isVisionModel = (modelId: string) => {
  for (const model of allModels) {
    if (model.id == modelId) {
      return model.capabilities.vision
    }
  }
  return false
}

export const findLlmModelById = (modelId: string) => {
  for (const model of allModels) {
    if (model.id == modelId) {
      return model
    }
  }
  return undefined
}

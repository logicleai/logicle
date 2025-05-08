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

// This EngineOwner is currently used to enable "owner" specific APIs (read: reasoning) for LogicleCloud backends.
export type EngineOwner = 'openai' | 'perplexity' | 'anthropic' | 'google' | 'meta' | 'mistral'

export interface LlmModel {
  id: string
  name: string
  owned_by: EngineOwner
  description: string
  context_length: number
  capabilities: LlmModelCapabilities
}

const withProvider = (models: LlmModel[], provider: ProviderType) => {
  return models.map((m) => {
    return {
      ...m,
      provider,
    }
  })
}

export const allModels = [
  ...withProvider(openaiModels, 'openai'),
  ...withProvider(logicleModels, 'logiclecloud'),
  ...withProvider(anthropicModels, 'anthropic'),
  ...withProvider(vertexModels, 'gcp-vertex'),
  ...withProvider(perplexityModels, 'perplexity'),
]

export function modelsByProvider(providerType: ProviderType): LlmModel[] {
  return allModels.filter((m) => m.provider == providerType)
}

export const isReasoningModel = (modelId: string) => {
  return allModels.find((m) => m.id == modelId)?.capabilities.reasoning == true
}

export const isToolCallingModel = (modelId: string) => {
  return allModels.find((m) => m.id == modelId)?.capabilities.function_calling == true
}

export const isVisionModel = (modelId: string) => {
  return allModels.find((m) => m.id == modelId)?.capabilities.vision == true
}

export const findLlmModelById = (modelId: string) => {
  for (const model of allModels) {
    if (model.id == modelId) {
      return model
    }
  }
  return undefined
}

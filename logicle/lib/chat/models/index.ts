import { ProviderType } from '@/types/provider'
import { openaiModels } from './openai'
import { logicleModels } from './logicle'
import { anthropicModels } from './anthropic'
import { vertexModels } from './vertex'

export interface LlmModelCapabilities {
  vision: boolean
  function_calling: boolean
}

export interface LlmModel {
  id: string
  name: string
  owned_by: string
  description: string
  context_length: number
  capabilities?: LlmModelCapabilities
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
    default:
      return []
  }
}

import { ProviderType } from '@/types/provider'
import { openaiModels } from './openai'
import { logicleModels } from './logicle'
import { anthropicModels } from './anthropic'
import { vertexModels } from './vertex'

export interface Model {
  id: string
  owned_by: string
}

export interface EnrichedModelCapabilities {
  vision: boolean
  functions: string
}

export interface EnrichmentModelData {
  name: string | null
  description: string | null
  context_length: number | null
  capabilities: {
    vision: boolean
    function_calling: boolean
  } | null
}

export interface EnrichedModel extends Model, EnrichmentModelData {}

export function getModels(providerType: ProviderType): EnrichedModel[] {
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

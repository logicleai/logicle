import * as schema from '@/db/schema'
import { ModelDetectionMode, ProviderType } from './provider'

export type ProviderDefault = Omit<schema.Backend, 'id'>

// Define a class that will create ProviderDefault objects
export class ProviderDefaultFactory {
  static create(providerType: ProviderType): ProviderDefault {
    // Initialize a new object with default values for apiKey and name omitted
    const newBackend: Partial<ProviderDefault> = {}
    newBackend.name = ''
    newBackend.apiKey = ''

    // Populate the object based on the provided type
    switch (providerType) {
      case ProviderType.OpenAI:
        newBackend.providerType = ProviderType.OpenAI
        newBackend.endPoint = 'https://api.openai.com/v1'
        newBackend.modelDetection = ModelDetectionMode.AUTO
        break
      case ProviderType.Anthropic:
        newBackend.providerType = ProviderType.Anthropic
        newBackend.endPoint = 'https://api.anthropic.com'
        newBackend.modelDetection = ModelDetectionMode.AUTO
        break
      case ProviderType.TogetherAI:
        newBackend.providerType = ProviderType.TogetherAI
        newBackend.endPoint = 'https://api.together.xyz/v1'
        newBackend.modelDetection = ModelDetectionMode.AUTO
        break
      case ProviderType.Groq:
        newBackend.providerType = ProviderType.Groq
        newBackend.endPoint = 'https://api.groq.com/openai/v1'
        newBackend.modelDetection = ModelDetectionMode.AUTO
        break
      case ProviderType.GenericOpenAI:
        newBackend.providerType = ProviderType.GenericOpenAI
        newBackend.modelDetection = ModelDetectionMode.AUTO
        break
      case ProviderType.LocalAI:
        newBackend.providerType = ProviderType.LocalAI
        newBackend.modelDetection = ModelDetectionMode.AUTO
        break
      case ProviderType.Ollama:
        newBackend.providerType = ProviderType.Ollama
        newBackend.modelDetection = ModelDetectionMode.AUTO
        break
      case ProviderType.LogicleCloud:
        newBackend.providerType = ProviderType.LogicleCloud
        newBackend.modelDetection = ModelDetectionMode.AUTO
        break
    }

    // Return the new object, assuming all required properties have been set
    return newBackend as ProviderDefault
  }
}

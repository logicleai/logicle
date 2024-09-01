import { ModelDetectionMode, ProviderType } from './provider'
import * as dto from '@/types/dto'

export type ProviderDefault = Omit<dto.Backend, 'id'>

// Define a class that will create ProviderDefault objects
export class ProviderDefaultFactory {
  static create(providerType: ProviderType): ProviderDefault {
    // Initialize a new object with default values for apiKey and name omitted
    const newBackend: Partial<ProviderDefault> = {}
    newBackend.name = ''
    newBackend.apiKey = ''
    newBackend.modelDetection = ModelDetectionMode.AUTO

    // Populate the object based on the provided type
    switch (providerType) {
      case ProviderType.OpenAI:
        newBackend.providerType = ProviderType.OpenAI
        newBackend.endPoint = 'https://api.openai.com/v1'
        break
      case ProviderType.Anthropic:
        newBackend.providerType = ProviderType.Anthropic
        newBackend.endPoint = 'https://api.anthropic.com'
        break
      case ProviderType.TogetherAI:
        newBackend.providerType = ProviderType.TogetherAI
        newBackend.endPoint = 'https://api.together.xyz/v1'
        break
      case ProviderType.Groq:
        newBackend.providerType = ProviderType.Groq
        newBackend.endPoint = 'https://api.groq.com/openai/v1'
        break
      case ProviderType.GenericOpenAI:
        newBackend.providerType = ProviderType.GenericOpenAI
        break
      case ProviderType.LocalAI:
        newBackend.providerType = ProviderType.LocalAI
        break
      case ProviderType.Ollama:
        newBackend.providerType = ProviderType.Ollama
        break
      case ProviderType.LogicleCloud:
        newBackend.providerType = ProviderType.LogicleCloud
        break
    }

    // Return the new object, assuming all required properties have been set
    return newBackend as ProviderDefault
  }
}

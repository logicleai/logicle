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
    newBackend.providerType = providerType

    // Populate the object based on the provided type
    switch (providerType) {
      case ProviderType.OpenAI:
        newBackend.endPoint = 'https://api.openai.com/v1'
        break
      case ProviderType.Anthropic:
        newBackend.endPoint = 'https://api.anthropic.com'
        break
      case ProviderType.TogetherAI:
        newBackend.endPoint = 'https://api.together.xyz/v1'
        break
      case ProviderType.Groq:
        newBackend.endPoint = 'https://api.groq.com/openai/v1'
        break
      case ProviderType.GenericOpenAI:
      case ProviderType.LocalAI:
      case ProviderType.Ollama:
      case ProviderType.LogicleCloud:
      case ProviderType.GcpVertex:
        break
    }

    // Return the new object, assuming all required properties have been set
    return newBackend as ProviderDefault
  }
}

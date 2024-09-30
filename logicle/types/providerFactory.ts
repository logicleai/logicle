import { ModelDetectionMode, ProviderType } from './provider'
import * as dto from '@/types/dto'

// Define a class that will create ProviderDefault objects
export class ProviderDefaultFactory {
  static create(providerType: ProviderType): dto.InsertableBackend {
    return {
      name: '',
      modelDetection: ModelDetectionMode.AUTO,
      providerType,
    }
  }
}

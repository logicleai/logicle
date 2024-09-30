import * as dto from '@/types/dto'
import { ProviderType } from './provider'

// Define a class that will create ProviderDefault objects
export class ProviderDefaultFactory {
  static create(providerType: ProviderType): dto.InsertableBackend {
    return {
      name: '',
      providerType,
    }
  }
}

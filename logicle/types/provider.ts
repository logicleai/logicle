import * as z from 'zod'
import { InsertableBackend, insertableBackendSchema } from './validation/backend'

export type ProviderType = z.infer<typeof insertableBackendSchema>['providerType']
export type ProviderConfig = InsertableBackend & { provisioned: number }

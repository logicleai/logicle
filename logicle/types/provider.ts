import * as z from 'zod'
import { insertableBackendSchema } from './validation/backend'
import { InsertableBackend } from './dto'

export type ProviderType = z.infer<typeof insertableBackendSchema>['providerType']
export type ProviderConfig = InsertableBackend & { provisioned: number }

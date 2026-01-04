import { InsertableBackend } from './validation/backend'

export const providerTypes = [
  'openai',
  'anthropic',
  'logiclecloud',
  'perplexity',
  'gcp-vertex',
  'gemini',
] as const

export type ProviderType = (typeof providerTypes)[number]

export type ProviderConfig = InsertableBackend & { provisioned: number }

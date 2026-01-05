import * as z from 'zod'
import * as schema from '@/db/schema'
import { ProviderConfig } from '../provider'

const zodApiKey = z.string().min(2, { message: 'Api Key  must be at least 2 characters' })
const zodName = z.string().min(2, { message: 'Backend name must be at least 2 characters.' })
const zodCredentials = z.string().min(2, { message: 'Credentials must be at least 2 characters.' })

const options = [
  z.object({ providerType: z.literal('openai'), name: zodName, apiKey: zodApiKey }),
  z.object({ providerType: z.literal('anthropic'), name: zodName, apiKey: zodApiKey }),
  z.object({
    providerType: z.literal('logiclecloud'),
    name: zodName,
    apiKey: zodApiKey,
    endPoint: z.string().url(),
  }),
  z.object({ providerType: z.literal('gcp-vertex'), name: zodName, credentials: zodCredentials }),
  z.object({ providerType: z.literal('perplexity'), name: zodName, apiKey: zodApiKey }),
  z.object({ providerType: z.literal('gemini'), name: zodName, apiKey: zodApiKey }),
] as const

export const insertableBackendSchema = z.discriminatedUnion('providerType', options)

// A "partial" version of the insertable schema for updates
// The discriminator must be re-required in each option, in order
// to be able to perform validation
export const updateableBackendSchema = z.discriminatedUnion(
  'providerType',
  options.map((o) =>
    o.partial().extend({
      providerType: o.shape.providerType, // re-require discriminator
    })
  ) as unknown as typeof options
)

export type Backend = Omit<schema.Backend, 'configuration' | 'providerType'> & ProviderConfig
export type InsertableBackend = z.infer<typeof insertableBackendSchema>
export type UpdateableBackend = Partial<InsertableBackend>

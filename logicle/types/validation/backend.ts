import * as z from 'zod'

const zodApiKey = z.string().min(2, { message: 'Api Key  must be at least 2 characters' })
const zodName = z.string().min(2, { message: 'Backend name must be at least 2 characters.' })
const zodCredentials = z.string().min(2, { message: 'Credentials must be at least 2 characters.' })

export const insertableBackendSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('openai'),
    name: zodName,
    apiKey: zodApiKey,
  }),
  z.object({
    providerType: z.literal('anthropic'),
    name: zodName,
    apiKey: zodApiKey,
  }),
  z.object({
    providerType: z.literal('logiclecloud'),
    name: zodName,
    apiKey: zodApiKey,
    endPoint: z.string().url(),
  }),
  z.object({
    providerType: z.literal('gcp-vertex'),
    name: zodName,
    credentials: zodCredentials,
  }),
  z.object({
    providerType: z.literal('perplexity'),
    name: zodName,
    apiKey: zodApiKey,
  }),
  z.object({
    providerType: z.literal('googlegenai'),
    name: zodName,
    apiKey: zodApiKey,
  }),
])

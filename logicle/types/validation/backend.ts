import * as z from 'zod'

export const insertableBackendSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('openai'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    apiKey: z.string().min(2, { message: 'Api Key  must be at least 2 characters.' }),
  }),
  z.object({
    providerType: z.literal('anthropic'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    apiKey: z.string().min(2, { message: 'Api Key  must be at least 2 characters.' }),
  }),
  z.object({
    providerType: z.literal('logiclecloud'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    endPoint: z.string().url(),
    apiKey: z.string().min(2, { message: 'Api Key  must be at least 2 characters.' }),
  }),
  z.object({
    providerType: z.literal('gcp-vertex'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    credentials: z.string().min(2, { message: 'Credentials must be at least 2 characters.' }),
  }),
  z.object({
    providerType: z.literal('perplexity'),
    name: z.string().min(2, { message: 'Username must be at least 2 characters.' }),
    apiKey: z.string().min(2, { message: 'Api Key  must be at least 2 characters.' }),
  }),
])

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

const backendOptions = [
  z.object({
    providerType: z.literal('openai'),
    name: zodName,
    apiKey: zodApiKey,
    id: z.string(),
    provisioned: z.number(),
  }),
  z.object({
    providerType: z.literal('anthropic'),
    name: zodName,
    apiKey: zodApiKey,
    id: z.string(),
    provisioned: z.number(),
  }),
  z.object({
    providerType: z.literal('logiclecloud'),
    name: zodName,
    apiKey: zodApiKey,
    endPoint: z.string().url(),
    id: z.string(),
    provisioned: z.number(),
  }),
  z.object({
    providerType: z.literal('gcp-vertex'),
    name: zodName,
    credentials: zodCredentials,
    id: z.string(),
    provisioned: z.number(),
  }),
  z.object({
    providerType: z.literal('perplexity'),
    name: zodName,
    apiKey: zodApiKey,
    id: z.string(),
    provisioned: z.number(),
  }),
  z.object({
    providerType: z.literal('gemini'),
    name: zodName,
    apiKey: zodApiKey,
    id: z.string(),
    provisioned: z.number(),
  }),
] as const

export const backendSchema = z.discriminatedUnion('providerType', backendOptions)

export const insertableBackendSchema = z.discriminatedUnion('providerType', options)

export const updateableBackendSchema = z.discriminatedUnion(
  'providerType',
  [
    backendOptions[0].omit({ id: true, provisioned: true }).partial().extend({
      providerType: backendOptions[0].shape.providerType,
    }),
    backendOptions[1].omit({ id: true, provisioned: true }).partial().extend({
      providerType: backendOptions[1].shape.providerType,
    }),
    backendOptions[2].omit({ id: true, provisioned: true }).partial().extend({
      providerType: backendOptions[2].shape.providerType,
    }),
    backendOptions[3].omit({ id: true, provisioned: true }).partial().extend({
      providerType: backendOptions[3].shape.providerType,
    }),
    backendOptions[4].omit({ id: true, provisioned: true }).partial().extend({
      providerType: backendOptions[4].shape.providerType,
    }),
    backendOptions[5].omit({ id: true, provisioned: true }).partial().extend({
      providerType: backendOptions[5].shape.providerType,
    }),
  ]
)

export type Backend = z.infer<typeof backendSchema>
export type InsertableBackend = z.infer<typeof insertableBackendSchema>
export type UpdateableBackend = z.infer<typeof updateableBackendSchema>

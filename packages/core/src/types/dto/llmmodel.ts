import { z } from 'zod'

const tokenizerStrategySchema = z.enum(['cl100k_base', 'o200k_base', 'approx_4chars'])

export const llmModelCapabilitiesSchema = z.object({
  vision: z.boolean(),
  function_calling: z.boolean(),
  reasoning: z.boolean(),
  supportedMedia: z.array(z.string()).optional(),
  web_search: z.boolean().optional(),
  knowledge: z.boolean().optional(),
}).meta({ id: 'LlmModelCapabilities' })

export const llmModelSchema = z.object({
  id: z.string(),
  model: z.string(),
  name: z.string(),
  provider: z.string(),
  owned_by: z.string(),
  description: z.string(),
  context_length: z.number(),
  capabilities: llmModelCapabilitiesSchema,
  defaultReasoning: z.string().nullable().optional(),
  tags: z.array(z.enum(['latest', 'obsolete'])).optional(),
  maxOutputTokens: z.number().optional(),
  tokenizer: tokenizerStrategySchema.optional(),
}).meta({ id: 'LlmModel' })

export type LlmModel = z.infer<typeof llmModelSchema>

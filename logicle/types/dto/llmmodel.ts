import { z } from 'zod'

export const llmModelCapabilitiesSchema = z.object({
  vision: z.boolean(),
  function_calling: z.boolean(),
  reasoning: z.boolean(),
  supportedMedia: z.array(z.string()).optional(),
  web_search: z.boolean().optional(),
  knowledge: z.boolean().optional(),
})

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
})

export type LlmModel = z.infer<typeof llmModelSchema>

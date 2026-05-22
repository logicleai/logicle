import { z } from 'zod'

const tokenizerStrategySchema = z.enum(['cl100k_base', 'o200k_base', 'approx_4chars', 'anthropic_heuristic'])

export const llmModelCapabilitiesSchema = z.object({
  vision: z.boolean(),
  function_calling: z.boolean(),
  supportedMedia: z.array(z.string()).optional(),
  web_search: z.boolean().optional(),
  knowledge: z.boolean().optional(),
  promptCaching: z.boolean().optional(),
}).meta({ id: 'LlmModelCapabilities' })

const reasoningEffortSchema = z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])

export const llmModelSchema = z.object({
  id: z.string(),
  model: z.string(),
  name: z.string(),
  provider: z.string(),
  owned_by: z.string(),
  description: z.string(),
  context_length: z.number(),
  capabilities: llmModelCapabilitiesSchema,
  defaultReasoning: reasoningEffortSchema.nullable().optional(),
  supportedReasoningEfforts: z.array(reasoningEffortSchema).optional(),
  tags: z.array(z.enum(['latest', 'obsolete'])).optional(),
  maxOutputTokens: z.number().optional(),
  tokenizer: tokenizerStrategySchema.optional(),
}).meta({ id: 'LlmModel' })

export type LlmModel = z.infer<typeof llmModelSchema>

import * as z from 'zod'

export const DEFAULT = '__DEFAULT__'

export const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
})

export const modelSchema = z.object({
  modelId: z.string(),
  backendId: z.string(),
})

export const formSchema = z.object({
  name: z.string().min(2, { message: 'name must be at least 2 characters.' }),
  iconUri: z.string().nullable(),
  description: z.string().min(2, { message: 'Description must be at least 2 characters.' }),
  model: modelSchema,
  systemPrompt: z.string(),
  reasoning_effort: z.enum(['low', 'medium', 'high', DEFAULT]),
  tokenLimit: z.coerce.number().min(256),
  temperature: z.coerce.number().min(0).max(1),
  tools: z.string().array(),
  files: fileSchema.array(),
  tags: z.string().array(),
  prompts: z.string().array(),
})

export type FormFields = z.infer<typeof formSchema>

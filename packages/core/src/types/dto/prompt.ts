import { z } from 'zod'

export const promptSchema = z.object({
  content: z.string(),
  description: z.string(),
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
}).meta({ id: 'Prompt' })

export const insertablePromptSchema = promptSchema
  .omit({ id: true, ownerId: true })
  .meta({ id: 'InsertablePrompt' })

export type Prompt = z.infer<typeof promptSchema>
export type InsertablePrompt = z.infer<typeof insertablePromptSchema>

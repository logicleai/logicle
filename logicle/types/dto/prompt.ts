import { z } from 'zod'

export const promptSchema = z.object({
  content: z.string(),
  description: z.string(),
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
})

export const insertablePromptSchema = promptSchema.omit({ id: true })

export type Prompt = z.infer<typeof promptSchema>
export type InsertablePrompt = z.infer<typeof insertablePromptSchema>

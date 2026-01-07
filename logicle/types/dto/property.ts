import { z } from 'zod'

export const propertySchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
})

export const insertablePropertySchema = propertySchema.omit({
  id: true,
})

export const propertyPatchSchema = z.record(z.string(), z.string())

export type Property = z.infer<typeof propertySchema>
export type InsertableProperty = z.infer<typeof insertablePropertySchema>

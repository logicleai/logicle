import { z } from 'zod'

export const propertySchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
})

export const insertablePropertySchema = propertySchema.omit({
  id: true,
})

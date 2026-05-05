import { z } from 'zod'

export const propertySchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
}).meta({ id: 'Property' })

export const insertablePropertySchema = propertySchema.omit({
  id: true,
}).meta({ id: 'InsertableProperty' })

export const propertyPatchSchema = z.record(z.string(), z.string()).meta({ id: 'PropertyPatch' })

export type Property = z.infer<typeof propertySchema>
export type InsertableProperty = z.infer<typeof insertablePropertySchema>

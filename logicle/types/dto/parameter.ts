import { z } from 'zod'

export const parameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  defaultValue: z.string().nullable(),
  provisioned: z.number(),
})

export type Parameter = z.infer<typeof parameterSchema>

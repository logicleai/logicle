import * as z from 'zod'

const sharing2Schema = z.enum(['private', 'public', 'workspace'])

export const toolSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string(),
  configuration: z.record(z.unknown()),
  tags: z.array(z.string()),
  icon: z.string().nullable(),
  sharing: sharing2Schema,
  provisioned: z.number(),
  capability: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

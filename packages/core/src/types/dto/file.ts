import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const fileOwnerSchema = z.object({
  ownerType: z.enum(['USER', 'CHAT', 'ASSISTANT', 'TOOL']),
  ownerId: z.string(),
})

export const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  size: z.number(),
  uploaded: z.union([z.literal(0), z.literal(1)]),
  createdAt: iso8601UtcDateTimeSchema,
  encrypted: z.union([z.literal(0), z.literal(1)]),
})

export const insertableFileSchema = fileSchema
  .omit({
    id: true,
    createdAt: true,
    uploaded: true,
    encrypted: true,
    path: true,
  })
  .extend({
    owner: fileOwnerSchema.optional(),
  })

export type FileOwner = z.infer<typeof fileOwnerSchema>
export type File = z.infer<typeof fileSchema>
export type InsertableFile = z.infer<typeof insertableFileSchema>

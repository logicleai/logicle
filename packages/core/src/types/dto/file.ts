import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const fileOwnerSchema = z.object({
  ownerType: z.enum(['USER', 'CHAT', 'ASSISTANT', 'TOOL']),
  ownerId: z.string(),
}).meta({ id: 'FileOwner' })

export const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  size: z.number(),
  createdAt: iso8601UtcDateTimeSchema,
  encrypted: z.union([z.literal(0), z.literal(1)]),
}).meta({ id: 'File' })

export const insertableFileSchema = fileSchema
  .omit({
    id: true,
    createdAt: true,
    encrypted: true,
    path: true,
  })
  .extend({
    owner: fileOwnerSchema,
  })
  .meta({ id: 'InsertableFile' })

export type FileOwner = z.infer<typeof fileOwnerSchema>
export type File = z.infer<typeof fileSchema>
export type InsertableFile = z.infer<typeof insertableFileSchema>

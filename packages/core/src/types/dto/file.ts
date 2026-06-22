import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const fileEncryptionSchema = z.enum(['pgp', 'aead']).nullable()

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
  encryption: fileEncryptionSchema,
}).meta({ id: 'File' })

export const fileDetailsSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  owner: fileOwnerSchema.extend({
    ownerName: z.string().nullable(),
  }),
  blob: z
    .object({
      id: z.string(),
      size: z.number(),
      encryption: fileEncryptionSchema,
      contentHash: z.string(),
      createdAt: iso8601UtcDateTimeSchema,
    })
    .nullable(),
}).meta({ id: 'FileDetails' })

export const insertableFileSchema = fileSchema
  .omit({
    id: true,
    createdAt: true,
    encryption: true,
    path: true,
  })
  .extend({
    owner: fileOwnerSchema,
  })
  .meta({ id: 'InsertableFile' })

export type FileOwner = z.infer<typeof fileOwnerSchema>
export type File = z.infer<typeof fileSchema>
export type FileDetails = z.infer<typeof fileDetailsSchema>
export type InsertableFile = z.infer<typeof insertableFileSchema>

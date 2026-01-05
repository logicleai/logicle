import { z } from 'zod'

export const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  size: z.number(),
  uploaded: z.union([z.literal(0), z.literal(1)]),
  createdAt: z.string(), // use .datetime() if ISO timestamps are guaranteed
  encrypted: z.union([z.literal(0), z.literal(1)]),
})

export const insertableFileSchema = fileSchema.omit({
  id: true,
  createdAt: true,
  uploaded: true,
  encrypted: true,
  path: true,
})

export type File = z.infer<typeof fileSchema>
export type InsertableFile = z.infer<typeof insertableFileSchema>

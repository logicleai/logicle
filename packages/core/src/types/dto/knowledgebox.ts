import * as z from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const knowledgeBoxDocumentStatusSchema = z
  .object({
    fileId: z.string(),
    status: z.enum(['pending', 'running', 'ready', 'failed']),
    error: z.string().nullable(),
    chunkCount: z.number().int(),
    projectionCount: z.number().int(),
    updatedAt: iso8601UtcDateTimeSchema,
  })
  .meta({ id: 'KnowledgeBoxDocumentStatus' })

export const knowledgeBoxStatusSchema = z
  .object({
    documents: z.array(knowledgeBoxDocumentStatusSchema),
  })
  .meta({ id: 'KnowledgeBoxStatus' })

export type KnowledgeBoxDocumentStatus = z.infer<typeof knowledgeBoxDocumentStatusSchema>
export type KnowledgeBoxStatus = z.infer<typeof knowledgeBoxStatusSchema>

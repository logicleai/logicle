import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const sessionSummarySchema = z.object({
  id: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  expiresAt: iso8601UtcDateTimeSchema,
  lastSeenAt: iso8601UtcDateTimeSchema.nullable(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  authMethod: z.enum(['password', 'idp']),
  idpConnectionId: z.string().nullable(),
  isCurrent: z.boolean(),
})

export type SessionSummary = z.infer<typeof sessionSummarySchema>

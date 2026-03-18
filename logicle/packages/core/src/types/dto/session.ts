import { z } from 'zod'

export const sessionSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  lastSeenAt: z.string().datetime().nullable(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  authMethod: z.enum(['password', 'idp']),
  idpConnectionId: z.string().nullable(),
  isCurrent: z.boolean(),
})

export type SessionSummary = z.infer<typeof sessionSummarySchema>

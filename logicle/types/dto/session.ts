import { z } from 'zod'

export const sessionSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  authMethod: z.enum(['password', 'idp']),
  idpConnectionId: z.string().nullable(),
  isCurrent: z.boolean(),
})

export type SessionSummary = z.infer<typeof sessionSummarySchema>

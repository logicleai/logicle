import { z } from 'zod'

export const tokenRateLimitSchema = z
  .object({
    enabled: z.literal(true),
    accumulated: z.number().describe('Tokens used in the current window.'),
    threshold: z.number().describe('Token threshold for the window.'),
    windowStart: z.string().describe('ISO timestamp of the current window start.'),
    windowEnd: z.string().describe('ISO timestamp when the current window expires.'),
    exceeded: z.boolean().describe('Whether accumulated tokens have reached the threshold.'),
  })
  .or(z.object({ enabled: z.literal(false) }))
  .meta({ id: 'TokenRateLimit' })

export type TokenRateLimit = z.infer<typeof tokenRateLimitSchema>

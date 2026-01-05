import { z } from 'zod'

export const joinRequestSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
})

export type JoinRequest = z.infer<typeof joinRequestSchema>

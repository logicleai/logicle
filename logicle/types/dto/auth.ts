import { z } from 'zod'

export const joinRequestSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
})

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export type JoinRequest = z.infer<typeof joinRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>

import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const satelliteSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
}).meta({ id: 'Satellite' })

export const insertableSatelliteSchema = z.object({
  name: z.string(),
})

export const satelliteToolSchema = z.object({
  id: z.string(),
  satelliteId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  inputSchema: z.record(z.string(), z.any()).nullable().optional(),
  outputSchema: z.record(z.string(), z.any()).nullable().optional(),
  createdAt: iso8601UtcDateTimeSchema,
})

export const insertableSatelliteToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.any()).optional(),
  outputSchema: z.record(z.string(), z.any()).optional(),
})

export type Satellite = z.infer<typeof satelliteSchema>
export type InsertableSatellite = z.infer<typeof insertableSatelliteSchema>
export type SatelliteTool = z.infer<typeof satelliteToolSchema>
export type InsertableSatelliteTool = z.infer<typeof insertableSatelliteToolSchema>

import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const satelliteSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
}).meta({ id: 'Satellite' })

export const insertableSatelliteSchema = satelliteSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).meta({ id: 'InsertableSatellite' })

export type Satellite = z.infer<typeof satelliteSchema>
export type InsertableSatellite = z.infer<typeof insertableSatelliteSchema>

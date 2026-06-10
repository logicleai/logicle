import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const satelliteSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
}).meta({ id: 'Satellite' })

export const satelliteListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['registered', 'ephemeral']),
  connected: z.boolean(),
  createdAt: iso8601UtcDateTimeSchema.nullable(),
  updatedAt: iso8601UtcDateTimeSchema.nullable(),
}).meta({ id: 'SatelliteListItem' })

export const insertableSatelliteSchema = z.object({
  name: z.string(),
})

export const updateableSatelliteSchema = insertableSatelliteSchema.partial()

export type Satellite = z.infer<typeof satelliteSchema>
export type SatelliteListItem = z.infer<typeof satelliteListItemSchema>
export type InsertableSatellite = z.infer<typeof insertableSatelliteSchema>
export type UpdateableSatellite = z.infer<typeof updateableSatelliteSchema>

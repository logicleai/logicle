import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'
import { sharing2Schema } from './tool'

export const satelliteSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    userId: z.string(),
    secret: z.string().nullable(),
    sharing: sharing2Schema,
    createdAt: iso8601UtcDateTimeSchema,
    updatedAt: iso8601UtcDateTimeSchema,
  })
  .meta({ id: 'Satellite' })

export const satelliteListItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['registered', 'ephemeral']),
    connected: z.boolean(),
    ownerName: z.string().nullable(),
    canManage: z.boolean(),
    createdAt: iso8601UtcDateTimeSchema.nullable(),
    updatedAt: iso8601UtcDateTimeSchema.nullable(),
  })
  .meta({ id: 'SatelliteListItem' })

const satelliteSharingSchema = sharing2Schema.refine(
  (sharing) => sharing.type !== 'workspace' || sharing.workspaces.length > 0,
  { message: 'Select at least one workspace' }
)

export const insertableSatelliteSchema = z.object({
  name: z.string(),
  sharing: satelliteSharingSchema.optional(),
})

export const updateableSatelliteSchema = insertableSatelliteSchema.partial().extend({
  sharing: satelliteSharingSchema.optional(),
})

export type Satellite = z.infer<typeof satelliteSchema>
export type SatelliteListItem = z.infer<typeof satelliteListItemSchema>
export type InsertableSatellite = z.infer<typeof insertableSatelliteSchema>
export type UpdateableSatellite = z.infer<typeof updateableSatelliteSchema>

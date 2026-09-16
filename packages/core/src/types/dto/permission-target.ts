import { z } from 'zod'
import { sharing2Schema } from './tool'

export const permissionTargetRefSchema = z
  .object({
    id: z.string(),
  })
  .meta({ id: 'PermissionTargetRef' })

export const permissionTargetSchema = z
  .object({
    id: z.string(),
    sharing: sharing2Schema,
  })
  .meta({ id: 'PermissionTarget' })

export type PermissionTargetRef = z.infer<typeof permissionTargetRefSchema>
export type PermissionTarget = z.infer<typeof permissionTargetSchema>

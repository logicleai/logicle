import { db } from 'db/database'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'
import { hashPassword } from '@/lib/auth/password'
import {
  createPermissionTargetAnd,
  deletePermissionTarget,
  getPermissionTargetsSharing,
  satellitePermissionTarget,
} from './permissionTarget'

const dbToDto = async (satellite: schema.Satellite): Promise<dto.Satellite> => {
  const sharing = await getPermissionTargetsSharing([satellitePermissionTarget(satellite.id)])
  return {
    id: satellite.id,
    name: satellite.name,
    userId: satellite.userId,
    secret: satellite.secret,
    sharing: sharing.get(satellite.id) ?? { type: 'private' },
    createdAt: satellite.createdAt,
    updatedAt: satellite.updatedAt,
  }
}

export const getSatellite = async (id: string): Promise<dto.Satellite | undefined> => {
  const result = await db
    .selectFrom('Satellite')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  return result ? await dbToDto(result) : undefined
}

export const getAllSatellites = async (): Promise<dto.Satellite[]> => {
  const result = await db.selectFrom('Satellite').selectAll().orderBy('createdAt', 'desc').execute()
  return await Promise.all(result.map(dbToDto))
}

export const getUserSatellites = async (userId: string): Promise<dto.Satellite[]> => {
  const result = await db
    .selectFrom('Satellite')
    .selectAll()
    .where('userId', '=', userId)
    .orderBy('createdAt', 'desc')
    .execute()
  return await Promise.all(result.map(dbToDto))
}

export const createSatellite = async (
  userId: string,
  data: dto.InsertableSatellite
): Promise<{ satellite: dto.Satellite; secret: string }> => {
  const id = nanoid()
  const now = new Date().toISOString()
  const secret = nanoid()
  await createPermissionTargetAnd(
    satellitePermissionTarget(id, userId),
    { type: 'private' },
    async (trx) => {
      return await trx
        .insertInto('Satellite')
        .values({
          id,
          name: data.name,
          userId,
          secret: await hashPassword(secret),
          createdAt: now,
          updatedAt: now,
        })
        .executeTakeFirstOrThrow()
    }
  )
  const created = await getSatellite(id)
  if (!created) {
    throw new Error('Failed creating satellite')
  }
  return { satellite: created, secret }
}

export const regenerateSatelliteSecret = async (
  id: string,
  userId: string
): Promise<{ satellite: dto.Satellite; secret: string }> => {
  const satellite = await getSatellite(id)
  if (!satellite) {
    throw new Error('Satellite not found')
  }
  if (satellite.userId !== userId) {
    throw new Error('Unauthorized')
  }
  const secret = nanoid()
  await db
    .updateTable('Satellite')
    .set({
      secret: await hashPassword(secret),
      updatedAt: new Date().toISOString(),
    })
    .where('id', '=', id)
    .execute()
  const updated = await getSatellite(id)
  if (!updated) {
    throw new Error('Failed regenerating satellite secret')
  }
  return { satellite: updated, secret }
}

export const updateSatellite = async (
  id: string,
  userId: string,
  data: Partial<dto.InsertableSatellite>
): Promise<dto.Satellite> => {
  const satellite = await getSatellite(id)
  if (!satellite) {
    throw new Error('Satellite not found')
  }
  if (satellite.userId !== userId) {
    throw new Error('Unauthorized')
  }
  const now = new Date().toISOString()
  await db
    .updateTable('Satellite')
    .set({
      ...data,
      updatedAt: now,
    })
    .where('id', '=', id)
    .execute()
  const updated = await getSatellite(id)
  if (!updated) {
    throw new Error('Failed updating satellite')
  }
  return updated
}

export const deleteSatellite = async (id: string, userId: string): Promise<void> => {
  const satellite = await getSatellite(id)
  if (!satellite) {
    throw new Error('Satellite not found')
  }
  if (satellite.userId !== userId) {
    throw new Error('Unauthorized')
  }
  await db.deleteFrom('Satellite').where('id', '=', id).execute()
  await deletePermissionTarget(id)
}

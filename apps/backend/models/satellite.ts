import { db } from 'db/database'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'

function dbToDto(satellite: schema.Satellite): dto.Satellite {
  return {
    id: satellite.id,
    name: satellite.name,
    userId: satellite.userId,
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
  return result ? dbToDto(result) : undefined
}

export const getAllSatellites = async (): Promise<dto.Satellite[]> => {
  const result = await db.selectFrom('Satellite').selectAll().orderBy('createdAt', 'desc').execute()
  return result.map(dbToDto)
}

export const getUserSatellites = async (userId: string): Promise<dto.Satellite[]> => {
  const result = await db
    .selectFrom('Satellite')
    .selectAll()
    .where('userId', '=', userId)
    .orderBy('createdAt', 'desc')
    .execute()
  return result.map(dbToDto)
}

export const createSatellite = async (
  userId: string,
  data: dto.InsertableSatellite
): Promise<dto.Satellite> => {
  const id = nanoid()
  const now = new Date().toISOString()
  await db
    .insertInto('Satellite')
    .values({
      id,
      name: data.name,
      userId,
      createdAt: now,
      updatedAt: now,
    })
    .executeTakeFirstOrThrow()
  const created = await getSatellite(id)
  if (!created) {
    throw new Error('Failed creating satellite')
  }
  return created
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
}

import * as dto from '@/types/dto'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export const getAllProperties = async () => {
  return db.selectFrom('Property').selectAll().execute()
}
export const getPropertyByName = async (name: dto.Property['name']) => {
  return db.selectFrom('Property').selectAll().where('name', '=', name).executeTakeFirst()
}

export const storeProperty = async (property: dto.InsertableProperty) => {
  const id = nanoid()
  return db
    .insertInto('Property')
    .values({
      ...property,
      id,
    })
    .onConflict((oc) =>
      oc.column('name').doUpdateSet({
        value: property.value,
      })
    )
    .executeTakeFirst()
}

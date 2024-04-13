import * as dto from '@/types/dto'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export default class Properties {
  static all = async () => {
    return db.selectFrom('Property').selectAll().execute()
  }

  static byName = async (name: dto.Property['name']) => {
    return db.selectFrom('Property').selectAll().where('name', '=', name).executeTakeFirst()
  }

  static put = async (property: dto.InsertableProperty) => {
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
}

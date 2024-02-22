import { InsertableProperty, Property } from '@/types/db'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export default class Properties {
  static all = async () => {
    return db.selectFrom('Property').selectAll().execute()
  }

  static byName = async (name: Property['name']) => {
    return db.selectFrom('Property').selectAll().where('name', '=', name).executeTakeFirst()
  }

  static put = async (property: InsertableProperty) => {
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

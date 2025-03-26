import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('User')
    .addColumn('preferences', 'json', (col) => col.notNull().defaultTo('{}'))
    .execute()
}

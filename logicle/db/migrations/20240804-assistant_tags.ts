import { Kysely } from 'kysely'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Assistant')
    .addColumn('tags', 'json', (col) => col.notNull().defaultTo('[]'))
    .execute()
}

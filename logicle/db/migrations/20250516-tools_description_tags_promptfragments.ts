import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Tool')
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .execute()
  await db.schema
    .alterTable('Tool')
    .addColumn('tags', 'json', (col) => col.notNull().defaultTo('[]'))
    .execute()
  await db.schema
    .alterTable('Tool')
    .addColumn('promptFragment', 'text', (col) => col.notNull().defaultTo(''))
    .execute()
}

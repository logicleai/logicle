import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Tool')
    .addColumn('capability', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
}

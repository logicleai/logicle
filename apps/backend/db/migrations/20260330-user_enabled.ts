import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('User')
    .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
    .execute()
}

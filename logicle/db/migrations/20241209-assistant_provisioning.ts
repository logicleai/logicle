import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Assistant')
    .addColumn('provisioned', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
}

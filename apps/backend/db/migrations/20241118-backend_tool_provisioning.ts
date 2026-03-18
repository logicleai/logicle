import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Backend')
    .addColumn('provisioned', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
  await db.schema
    .alterTable('Tool')
    .addColumn('provisioned', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
}

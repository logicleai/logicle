import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('MessageAudit')
    .addColumn('tokenDetails', 'jsonb', (col) => col.defaultTo(null))
    .execute()
}

import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Tool')
    .addColumn('satelliteId', 'text')
    .addColumn('enabled', 'boolean', (col) => col.defaultTo(true).notNull())
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Tool')
    .dropColumn('satelliteId')
    .dropColumn('enabled')
    .execute()
}

import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Tool')
    .addColumn('satelliteId', 'text')
    .execute()

  await db.schema
    .alterTable('Tool')
    .addColumn('enabled', 'integer', (col) => col.defaultTo(1))
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Tool')
    .dropColumn('satelliteId')
    .dropColumn('enabled')
    .execute()
}

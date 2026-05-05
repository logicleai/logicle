import { Kysely } from 'kysely'

export async function up(db: Kysely<any>) {
  await db.schema.alterTable('AssistantVersionFile').addColumn('order', 'integer').execute()
}

export async function down(db: Kysely<any>) {
  await db.schema.alterTable('AssistantVersionFile').dropColumn('order').execute()
}

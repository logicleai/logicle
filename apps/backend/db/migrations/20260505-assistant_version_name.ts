import { Kysely } from 'kysely'

export async function up(db: Kysely<any>) {
  await db.schema.alterTable('AssistantVersion').addColumn('versionName', 'text').execute()
}

export async function down(db: Kysely<any>) {
  await db.schema.alterTable('AssistantVersion').dropColumn('versionName').execute()
}

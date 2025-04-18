import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  await db.schema
    .createTable('ConversationSharing')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('lastMessageId', 'text', (col) => col.notNull())
    .execute()
}

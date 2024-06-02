import { Kysely } from 'kysely'

const string = 'text'
const timestamp = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('MessageAudit')
    .addColumn('messageId', string, (col) => col.notNull())
    .addColumn('conversationId', string, (col) => col.notNull())
    .addColumn('userId', string, (col) => col.notNull())
    .addColumn('assistantId', string, (col) => col.notNull())
    .addColumn('type', string, (col) => col.notNull())
    .addColumn('model', string, (col) => col.notNull())
    .addColumn('tokens', 'integer', (col) => col.notNull())
    .addColumn('errors', string)
    .addColumn('sentAt', 'timestamp', (col) => col.notNull())
    .execute()
}

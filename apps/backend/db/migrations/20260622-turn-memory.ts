import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('AssistantVersion')
    .addColumn('contextCompression', 'text', (col) => col.defaultTo(null))
    .execute()

  await db.schema
    .createTable('TurnMemory')
    .addColumn('id', 'text', (col) => col.primaryKey().notNull())
    .addColumn('conversationId', 'text', (col) => col.notNull())
    .addColumn('userMessageId', 'text', (col) => col.notNull())
    .addColumn('userIntent', 'text', (col) => col.notNull())
    .addColumn('answerSummary', 'text', (col) => col.notNull())
    .addColumn('durableFacts', 'text', (col) => col.notNull())
    .addColumn('openQuestions', 'text', (col) => col.notNull())
    .addColumn('decisions', 'text', (col) => col.notNull())
    .addColumn('rehydrationHints', 'text', (col) => col.notNull())
    .addColumn('warnings', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'timestamp', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('TurnMemory_conversationId_userMessageId_unique')
    .unique()
    .on('TurnMemory')
    .columns(['conversationId', 'userMessageId'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('TurnMemory').execute()

  await db.schema
    .alterTable('AssistantVersion')
    .dropColumn('contextCompression')
    .execute()
}

import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('Conversation').addColumn('lastMsgSentAt', 'text').execute()

  await db
    .updateTable('Conversation')
    .set({
      lastMsgSentAt: (eb) =>
        eb
          .selectFrom('Message')
          .select('Message.sentAt')
          .whereRef('Message.conversationId', '=', 'Conversation.id')
          .orderBy('Message.sentAt', 'desc')
          .limit(1),
    })
    .execute()

  await db.schema
    .createIndex('conversation_ownerId_lastMsgSentAt')
    .on('Conversation')
    .columns(['ownerId', 'lastMsgSentAt'])
    .execute()
}

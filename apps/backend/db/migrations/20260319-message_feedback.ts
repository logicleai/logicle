import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('MessageFeedback')
    .addColumn('messageId', 'text', (col) => col.notNull())
    .addColumn('userId', 'text', (col) => col.notNull())
    .addColumn('positive', 'integer', (col) => col.notNull())
    .addColumn('comment', 'text')
    .addColumn('createdAt', 'timestamp', (col) => col.notNull())
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull())
    .addPrimaryKeyConstraint('pk_MessageFeedback', ['messageId', 'userId'])
    .addForeignKeyConstraint('fk_MessageFeedback_Message', ['messageId'], 'Message', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()
}

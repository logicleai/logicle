import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('CompressedMessage')
    .addColumn('sourceMessageId', 'text', (col) => col.notNull())
    .addColumn('compressionVersion', 'integer', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('version', 'integer')
    .addColumn('createdAt', 'timestamp', (col) => col.notNull())
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('CompressedMessage_sourceMessageId_compressionVersion_unique')
    .unique()
    .on('CompressedMessage')
    .columns(['sourceMessageId', 'compressionVersion'])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('CompressedMessage').execute()
}

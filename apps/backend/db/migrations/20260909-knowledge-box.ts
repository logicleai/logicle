import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('KnowledgeBoxDocument')
    .addColumn('boxId', 'text', (col) => col.notNull())
    .addColumn('fileId', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('error', 'text')
    .addColumn('contentHash', 'text')
    .addColumn('ingestVersion', 'integer', (col) => col.notNull())
    .addColumn('configHash', 'text', (col) => col.notNull())
    .addColumn('chunkCount', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'timestamp', (col) => col.notNull())
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('KnowledgeBoxDocument_boxId_fileId_unique')
    .unique()
    .on('KnowledgeBoxDocument')
    .columns(['boxId', 'fileId'])
    .execute()

  await db.schema
    .createIndex('KnowledgeBoxDocument_status')
    .on('KnowledgeBoxDocument')
    .columns(['status'])
    .execute()

  await db.schema
    .createTable('KnowledgeChunk')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('boxId', 'text', (col) => col.notNull())
    .addColumn('fileId', 'text', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('heading', 'text')
    .addColumn('text', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('KnowledgeChunk_boxId')
    .on('KnowledgeChunk')
    .columns(['boxId'])
    .execute()

  await db.schema
    .createIndex('KnowledgeChunk_boxId_fileId_seq_unique')
    .unique()
    .on('KnowledgeChunk')
    .columns(['boxId', 'fileId', 'seq'])
    .execute()

  await db.schema
    .createTable('KnowledgeProjection')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('boxId', 'text', (col) => col.notNull())
    .addColumn('fileId', 'text', (col) => col.notNull())
    .addColumn('questionId', 'text', (col) => col.notNull())
    .addColumn('answer', 'text')
    .addColumn('createdAt', 'timestamp', (col) => col.notNull())
    .addColumn('updatedAt', 'timestamp', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('KnowledgeProjection_boxId_fileId_questionId_unique')
    .unique()
    .on('KnowledgeProjection')
    .columns(['boxId', 'fileId', 'questionId'])
    .execute()
}

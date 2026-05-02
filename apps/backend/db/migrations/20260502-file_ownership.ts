import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  await db.schema.alterTable('File').addColumn('contentHash', 'text').execute()

  await db.schema.createIndex('idx_File_contentHash').on('File').column('contentHash').execute()

  if (dialect === 'postgresql') {
    await db.schema
      .createType('FileOwnerType')
      .asEnum(['USER', 'CHAT', 'ASSISTANT', 'TOOL'])
      .execute()
    await db.schema
      .createTable('FileOwnership')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('fileId', 'text', (col) => col.notNull())
      .addColumn('ownerType', sql`"FileOwnerType"`, (col) => col.notNull())
      .addColumn('ownerId', 'text', (col) => col.notNull())
      .addColumn('displayName', 'text')
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addForeignKeyConstraint('fk_FileOwnership_File', ['fileId'], 'File', ['id'], (cb) =>
        cb.onDelete('cascade')
      )
      .addUniqueConstraint('uq_FileOwnership_fileId_ownerType_ownerId', [
        'fileId',
        'ownerType',
        'ownerId',
      ])
      .execute()
  } else {
    await db.schema
      .createTable('FileOwnership')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('fileId', 'text', (col) => col.notNull())
      .addColumn('ownerType', 'text', (col) => col.notNull())
      .addColumn('ownerId', 'text', (col) => col.notNull())
      .addColumn('displayName', 'text')
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addForeignKeyConstraint('fk_FileOwnership_File', ['fileId'], 'File', ['id'], (cb) =>
        cb.onDelete('cascade')
      )
      .addUniqueConstraint('uq_FileOwnership_fileId_ownerType_ownerId', [
        'fileId',
        'ownerType',
        'ownerId',
      ])
      .execute()
  }

  await db.schema
    .createIndex('idx_FileOwnership_ownerType_ownerId')
    .on('FileOwnership')
    .columns(['ownerType', 'ownerId'])
    .execute()

  await db.schema.createIndex('idx_FileOwnership_fileId').on('FileOwnership').column('fileId').execute()
}

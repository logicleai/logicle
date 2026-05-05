import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  await db.schema
    .createTable('FileBlob')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('contentHash', 'text', (col) => col.notNull())
    .addColumn('path', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('size', 'integer', (col) => col.notNull())
    .addColumn('encrypted', 'integer', (col) => col.notNull())
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('idx_FileBlob_contentHash')
    .on('FileBlob')
    .column('contentHash')
    .unique()
    .execute()

  if (dialect === 'postgresql') {
    await db.schema
      .alterTable('File')
      .addColumn('fileBlobId', 'text')
      .addColumn('ownerType', sql`"FileOwnerType"`)
      .addColumn('ownerId', 'text')
      .execute()

    await db.schema
      .alterTable('File')
      .addForeignKeyConstraint('fk_File_fileBlobId', ['fileBlobId'], 'FileBlob', ['id'])
      .execute()
  } else {
    await sql`PRAGMA foreign_keys = OFF`.execute(db)

    await db.schema
      .createTable('File_new')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('path', 'text', (col) => col.notNull())
      .addColumn('type', 'text', (col) => col.notNull())
      .addColumn('size', 'integer', (col) => col.notNull())
      .addColumn('uploaded', 'integer', (col) => col.notNull())
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addColumn('encrypted', 'integer', (col) => col.notNull())
      .addColumn('fileBlobId', 'text')
      .addColumn('ownerType', 'text')
      .addColumn('ownerId', 'text')
      .addForeignKeyConstraint('fk_File_fileBlobId', ['fileBlobId'], 'FileBlob', ['id'])
      .execute()

    await db
      .insertInto('File_new')
      .columns([
        'id',
        'name',
        'path',
        'type',
        'size',
        'uploaded',
        'createdAt',
        'encrypted',
        'fileBlobId',
        'ownerType',
        'ownerId',
      ])
      .expression((eb) =>
        eb.selectFrom('File').select([
          'id',
          'name',
          'path',
          'type',
          'size',
          'uploaded',
          'createdAt',
          'encrypted',
          sql<null>`NULL`.as('fileBlobId'),
          sql<null>`NULL`.as('ownerType'),
          sql<null>`NULL`.as('ownerId'),
        ])
      )
      .execute()

    await db.schema.dropTable('File').execute()
    await db.schema.alterTable('File_new').renameTo('File').execute()
    await sql`PRAGMA foreign_keys = ON`.execute(db)
  }

  await db.schema.createIndex('idx_File_fileBlobId').on('File').column('fileBlobId').execute()

  await db.schema
    .createIndex('idx_File_ownerType_ownerId')
    .on('File')
    .columns(['ownerType', 'ownerId'])
    .execute()

  await db
    .insertInto('FileBlob')
    .columns(['id', 'contentHash', 'path', 'type', 'size', 'encrypted', 'createdAt'])
    .expression((eb) =>
      eb
        .selectFrom('File as f')
        .leftJoin('FileBlob as fb', 'fb.id', 'f.id')
        .select([
          'f.id',
          sql<string>`'legacy:' || ${eb.ref('f.id')}`.as('contentHash'),
          'f.path',
          'f.type',
          'f.size',
          'f.encrypted',
          'f.createdAt',
        ])
        .where('f.uploaded', '=', 1)
        .where('fb.id', 'is', null)
    )
    .execute()

  await sql`
    UPDATE "File"
    SET "fileBlobId" = "File"."id"
    WHERE "File"."uploaded" = 1
  `.execute(db)
}

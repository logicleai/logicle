import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  await db.schema.alterTable('File').addColumn('contentHash', 'text').execute()
  await db.schema.createIndex('idx_File_contentHash').on('File').column('contentHash').execute()

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

  await db.schema.createIndex('idx_FileBlob_contentHash').on('FileBlob').column('contentHash').unique().execute()

  await db.schema.alterTable('File').addColumn('fileBlobId', 'text').execute()

  if (dialect === 'postgresql') {
    await db.schema
      .alterTable('File')
      .addForeignKeyConstraint('fk_File_fileBlobId', ['fileBlobId'], 'FileBlob', ['id'])
      .execute()
  }

  await db.schema.createIndex('idx_File_fileBlobId').on('File').column('fileBlobId').execute()

  if (dialect === 'postgresql') {
    await db.schema.alterTable('File').addColumn('ownerType', sql`"FileOwnerType"`).execute()
  } else {
    await db.schema.alterTable('File').addColumn('ownerType', 'text').execute()
  }
  await db.schema.alterTable('File').addColumn('ownerId', 'text').execute()

  await db.schema.createIndex('idx_File_ownerType_ownerId').on('File').columns(['ownerType', 'ownerId']).execute()

  if (dialect === 'postgresql') {
    await sql`
      INSERT INTO "FileBlob" ("id", "contentHash", "path", "type", "size", "encrypted", "createdAt")
      SELECT
        md5('fileblob:' || f."contentHash") AS "id",
        f."contentHash",
        f."path",
        f."type",
        f."size",
        f."encrypted",
        MIN(f."createdAt")
      FROM "File" f
      WHERE f."uploaded" = 1 AND f."contentHash" IS NOT NULL
      GROUP BY f."contentHash", f."path", f."type", f."size", f."encrypted"
      ON CONFLICT ("contentHash") DO NOTHING
    `.execute(db)

    await sql`
      UPDATE "File" f
      SET "fileBlobId" = fb."id"
      FROM "FileBlob" fb
      WHERE f."uploaded" = 1
        AND f."contentHash" IS NOT NULL
        AND f."contentHash" = fb."contentHash"
    `.execute(db)
  } else {
    await sql`
      INSERT OR IGNORE INTO "FileBlob" ("id", "contentHash", "path", "type", "size", "encrypted", "createdAt")
      SELECT
        lower(hex(randomblob(16))) AS "id",
        f."contentHash",
        f."path",
        f."type",
        f."size",
        f."encrypted",
        MIN(f."createdAt")
      FROM "File" f
      WHERE f."uploaded" = 1 AND f."contentHash" IS NOT NULL
      GROUP BY f."contentHash", f."path", f."type", f."size", f."encrypted"
    `.execute(db)

    await sql`
      UPDATE "File"
      SET "fileBlobId" = (
        SELECT fb."id" FROM "FileBlob" fb WHERE fb."contentHash" = "File"."contentHash" LIMIT 1
      )
      WHERE "File"."uploaded" = 1 AND "File"."contentHash" IS NOT NULL
    `.execute(db)
  }
}

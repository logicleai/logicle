import { Kysely, sql } from 'kysely'

const fileEncryptionSql = sql`
  CASE "encrypted"::text
    WHEN '0' THEN NULL
    WHEN 'none' THEN NULL
    WHEN '1' THEN 'pgp'
    WHEN '2' THEN 'aead'
    WHEN 'aead-v1' THEN 'aead'
    ELSE "encrypted"::text
  END
`

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  if (dialect === 'postgresql') {
    await db.schema.createType('FileEncryption').asEnum(['pgp', 'aead']).execute()
    await db.schema.alterTable('FileBlob').alterColumn('encrypted', (col) => col.dropNotNull()).execute()
    await sql`
      ALTER TABLE "FileBlob"
      ALTER COLUMN "encrypted" TYPE "FileEncryption"
      USING (${fileEncryptionSql})::"FileEncryption"
    `.execute(db)
    await db.schema.alterTable('FileBlob').renameColumn('encrypted', 'encryption').execute()
    return
  }

  await sql`PRAGMA foreign_keys = OFF`.execute(db)
  await db.schema
    .createTable('FileBlob_new')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('contentHash', 'text', (col) => col.notNull())
    .addColumn('path', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('size', 'integer', (col) => col.notNull())
    .addColumn('encryption', 'text', (col) =>
      col.check(sql`"encryption" IN ('pgp', 'aead')`)
    )
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .execute()

  await sql`
    INSERT INTO "FileBlob_new" ("id", "contentHash", "path", "type", "size", "encryption", "createdAt")
    SELECT
      "id",
      "contentHash",
      "path",
      "type",
      "size",
      CASE CAST("encrypted" AS TEXT)
        WHEN '0' THEN NULL
        WHEN 'none' THEN NULL
        WHEN '1' THEN 'pgp'
        WHEN '2' THEN 'aead'
        WHEN 'aead-v1' THEN 'aead'
        ELSE CAST("encrypted" AS TEXT)
      END,
      "createdAt"
    FROM "FileBlob"
  `.execute(db)

  await db.schema.dropTable('FileBlob').execute()
  await db.schema.alterTable('FileBlob_new').renameTo('FileBlob').execute()
  await db.schema
    .createIndex('idx_FileBlob_contentHash')
    .on('FileBlob')
    .column('contentHash')
    .unique()
    .execute()
  await sql`PRAGMA foreign_keys = ON`.execute(db)
}

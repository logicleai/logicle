import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('File')
    .addColumn('parentFileId', 'text', (col) => col.references('File.id').onDelete('set null'))
    .execute()

  await db.schema.createIndex('idx_File_parentFileId').on('File').column('parentFileId').execute()
}

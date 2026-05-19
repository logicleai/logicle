import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  if (dialect === 'postgresql') {
    await db.schema.createType('FileOrigin').asEnum(['uploaded', 'generated']).execute()

    await db.schema
      .alterTable('File')
      .addColumn('origin', sql`"FileOrigin"`, (col) => col.defaultTo(sql`NULL`))
      .execute()
  } else {
    await db.schema
      .alterTable('File')
      .addColumn('origin', 'text', (col) => col.defaultTo(sql`NULL`))
      .execute()
  }

  await db.schema.createIndex('idx_File_origin').on('File').column('origin').execute()
}

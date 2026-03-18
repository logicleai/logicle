import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  if (dialect === 'postgresql') {
    await db.schema
      .createType('FileAnalysisKind')
      .asEnum(['pdf', 'image', 'spreadsheet', 'presentation', 'word', 'unknown'])
      .execute()
    await db.schema
      .createType('FileAnalysisStatus')
      .asEnum(['ready', 'failed', 'unavailable'])
      .execute()

    await db.schema
      .createTable('FileAnalysis')
      .addColumn('fileId', 'text', (col) => col.notNull().primaryKey())
      .addColumn('kind', sql`"FileAnalysisKind"`, (col) => col.notNull())
      .addColumn('status', sql`"FileAnalysisStatus"`, (col) => col.notNull())
      .addColumn('analyzerVersion', 'integer', (col) => col.notNull())
      .addColumn('payload', 'jsonb')
      .addColumn('error', 'text')
      .addColumn('createdAt', 'timestamp', (col) => col.notNull())
      .addColumn('updatedAt', 'timestamp', (col) => col.notNull())
      .addForeignKeyConstraint('fk_FileAnalysis_File', ['fileId'], 'File', ['id'], (cb) =>
        cb.onDelete('cascade')
      )
      .execute()
  } else {
    await db.schema
      .createTable('FileAnalysis')
      .addColumn('fileId', 'text', (col) => col.notNull().primaryKey())
      .addColumn('kind', 'text', (col) => col.notNull())
      .addColumn('status', 'text', (col) => col.notNull())
      .addColumn('analyzerVersion', 'integer', (col) => col.notNull())
      .addColumn('payload', 'text')
      .addColumn('error', 'text')
      .addColumn('createdAt', 'text', (col) => col.notNull())
      .addColumn('updatedAt', 'text', (col) => col.notNull())
      .addForeignKeyConstraint('fk_FileAnalysis_File', ['fileId'], 'File', ['id'], (cb) =>
        cb.onDelete('cascade')
      )
      .execute()
  }
}

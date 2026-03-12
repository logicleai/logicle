import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('FileAnalysis')
    .addColumn('fileId', 'varchar(255)', (col) => col.notNull().primaryKey())
    .addColumn('kind', 'varchar(64)', (col) => col.notNull())
    .addColumn('status', 'varchar(64)', (col) => col.notNull())
    .addColumn('analyzerVersion', 'varchar(255)')
    .addColumn('payload', 'json')
    .addColumn('error', 'text')
    .addColumn('createdAt', 'varchar(255)', (col) => col.notNull())
    .addColumn('updatedAt', 'varchar(255)', (col) => col.notNull())
    .addForeignKeyConstraint('fk_FileAnalysis_File', ['fileId'], 'File', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()
}

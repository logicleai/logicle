import { Kysely } from 'kysely'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('AssistantFile')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('assistantId', string, (col) => col.notNull())
    .addColumn('fileId', string, (col) => col.notNull())
    .addForeignKeyConstraint(
      'fk_AssistantFile_Assistant',
      ['assistantId'],
      'Assistant',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('fk_AssistantFile_File', ['fileId'], 'File', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()
}

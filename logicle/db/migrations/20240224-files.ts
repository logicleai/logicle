import { Kysely } from 'kysely'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('AssistantFile')
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

  await db.schema
    .createTable('ToolFile')
    .addColumn('toolId', string, (col) => col.notNull())
    .addColumn('fileId', string, (col) => col.notNull())
    .addColumn('externalId', string)
    .addColumn('status', string, (col) => col.notNull())
    .addForeignKeyConstraint('fk_ToolFile_Tool', ['toolId'], 'Tool', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('fk_ToolFile_File', ['fileId'], 'File', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()
}

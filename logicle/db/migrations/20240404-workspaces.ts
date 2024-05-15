import { Kysely } from 'kysely'

const string = 'text'
const timestamp = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('Assistant').addColumn('owner', string).execute()
  await db.schema
    .createTable('AssistantSharing')
    .addColumn('assistantId', string, (col) => col.notNull())
    .addColumn('workspaceId', string)
    .addForeignKeyConstraint(
      'fk_AssistantSharing_Assistant',
      ['assistantId'],
      'Assistant',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint(
      'fk_AssistantSharing_Workspace',
      ['workspaceId'],
      'Workspace',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .execute()
  await db.schema
    .createIndex('AssistantSharing_assistantId_workspaceId')
    .on('AssistantSharing')
    .columns(['assistantId', 'workspaceId'])
    .execute()
}

import { Kysely } from 'kysely'
import { nanoid } from 'nanoid'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  // Recreate the entire table.
  // SQLITE does not allow to add a Primary Key to a table
  const sharingList = await db.selectFrom('AssistantSharing').selectAll().execute()
  await db.schema.dropTable('AssistantSharing').execute()
  await db.schema
    .createTable('AssistantSharing')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('assistantId', string, (col) => col.notNull())
    .addColumn('workspaceId', string)
    .addColumn('provisioned', 'integer', (col) => col.notNull().defaultTo(0))
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

  if (sharingList.length != 0) {
    const sharingListWithId = sharingList.map((v) => {
      return {
        id: nanoid(),
        provisioned: 0,
        ...v,
      }
    })
    await db.insertInto('AssistantSharing').values(sharingListWithId).execute()
  }
}

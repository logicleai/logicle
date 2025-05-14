import { Kysely, sql } from 'kysely'

async function createAssistantsTable(db: Kysely<any>, assistants: any[]) {
  await db.schema
    .createTable('Assistant')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('owner', 'text', (col) => col.notNull())
    .addColumn('provisioned', 'integer', (col) => col.notNull())
    .addColumn('deleted', 'integer', (col) => col.notNull())
    .addColumn('draftVersionId', 'text', (col) => col.notNull().references('AssistantVersion.id'))
    .addColumn('publishedVersionId', 'text', (col) => col.references('AssistantVersion.id'))
    .execute()
  await db
    .insertInto('Assistant')
    .values(
      assistants.map((row) => {
        return {
          id: row.id,
          owner: row.owner,
          provisioned: row.provisioned,
          deleted: row.deleted,
          draftVersionId: row.id,
          publishedVersionId: row.id,
        }
      })
    )
    .execute()
}

async function createAssistantVersionTable(db: Kysely<any>, assistants: any[]) {
  // Create AssistantVersion and migrate
  await db.schema
    .createTable('AssistantVersion')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('imageId', 'text', (col) => col.references('Image.id'))
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('model', 'text', (col) => col.notNull())
    .addColumn('systemPrompt', 'text', (col) => col.notNull())
    .addColumn('backendId', 'text', (col) => col.notNull())
    .addColumn('tokenLimit', 'integer', (col) => col.notNull())
    .addColumn('temperature', 'real', (col) => col.notNull())
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .addColumn('tags', 'json', (col) => col.notNull())
    .addColumn('reasoning_effort', 'text')
    .addColumn('prompts', 'json', (col) => col.notNull())
    .addForeignKeyConstraint('fk_AssistantVersion_Backend', ['backendId'], 'Backend', ['id'])
    .execute()
  await db
    .insertInto('AssistantVersion')
    .values(
      assistants.map((a) => {
        const { owner, provisioned, deleted, ...clean } = a
        return clean
      })
    )
    .execute()
}

async function createAssistantVersionToolAssociationTable(db: Kysely<any>, assistantTools: any[]) {
  await db.schema
    .createTable('AssistantVersionToolAssociation')
    .addColumn('assistantVersionId', 'text', (col) => col.notNull())
    .addColumn('toolId', 'text', (col) => col.notNull())
    .addForeignKeyConstraint(
      'fk_AssistantVersionToolAssociation_Assistant',
      ['assistantVersionId'],
      'AssistantVersion',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint(
      'fk_AssistantVersionToolAssociation_Tool',
      ['toolId'],
      'Tool',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addPrimaryKeyConstraint('primary_AssistantVersion_Tool', ['assistantVersionId', 'toolId'])
    .execute()
  await db
    .insertInto('AssistantVersionToolAssociation')
    .values(
      assistantTools.map((row) => {
        return {
          ...row,
          assistantId: undefined,
          assistantVersionId: row.assistantId,
        }
      })
    )
    .execute()
}

async function createAssistantVersionFileAssociationTable(db: Kysely<any>, assistantFiles: any[]) {
  await db.schema
    .createTable('AssistantVersionFile')
    .addColumn('assistantVersionId', 'text', (col) => col.notNull())
    .addColumn('fileId', 'text', (col) => col.notNull())
    .addForeignKeyConstraint(
      'fk_AssistantVersionFile_Assistant',
      ['assistantVersionId'],
      'AssistantVersion',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('fk_AssistantVersionFile_File', ['fileId'], 'File', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()
  await db
    .insertInto('AssistantVersionFile')
    .values(
      assistantFiles.map((row) => {
        return {
          ...row,
          assistantId: undefined,
          assistantVersionId: row.assistantId,
        }
      })
    )
    .execute()
}

async function createAssistantSharingTable(db: Kysely<any>, sharing: any[]) {
  await db.schema
    .createTable('AssistantSharing')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('assistantId', 'text', (col) => col.notNull())
    .addColumn('workspaceId', 'text')
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
  await db.insertInto('AssistantSharing').values(sharing).execute()
}

async function createAssistantUserDataTable(db: Kysely<any>, userData: any[]) {
  await db.schema
    .createTable('AssistantUserData')
    .addColumn('userId', 'text', (col) => col.notNull())
    .addColumn('assistantId', 'text', (col) => col.notNull())
    .addColumn('pinned', 'integer', (col) => col.notNull())
    .addColumn('lastUsed', 'text', (col) => col)
    .addPrimaryKeyConstraint('pk_AssistantUserData', ['userId', 'assistantId'])
    .addForeignKeyConstraint('fk_AssistantUserData_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .addForeignKeyConstraint(
      'fk_AssistantUserData_Assistant',
      ['assistantId'],
      'Assistant',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .execute()
  await db.insertInto('AssistantUserData').values(userData).execute()
}

export async function up(db: Kysely<any>): Promise<void> {
  const assistants = await db.selectFrom('Assistant').selectAll().execute()
  const assistantFiles = await db.selectFrom('AssistantFile').selectAll().execute()
  const assistantTools = await db.selectFrom('AssistantToolAssociation').selectAll().execute()
  const assistantSharing = await db.selectFrom('AssistantSharing').selectAll().execute()
  const assistantUserData = await db.selectFrom('AssistantUserData').selectAll().execute()

  await db.schema.dropTable('AssistantFile').execute()
  await db.schema.dropTable('AssistantToolAssociation').execute()
  await db.schema.dropTable('AssistantSharing').execute()
  await db.schema.dropTable('AssistantUserData').execute()

  await sql`PRAGMA foreign_keys=0`.execute(db)
  await db.schema.dropTable('Assistant').execute()
  await createAssistantsTable(db, assistants)
  await sql`PRAGMA foreign_keys=1`.execute(db)

  await createAssistantVersionTable(db, assistants)
  await createAssistantVersionToolAssociationTable(db, assistantTools)
  await createAssistantVersionFileAssociationTable(db, assistantFiles)
  await createAssistantSharingTable(db, assistantSharing)
  await createAssistantUserDataTable(db, assistantUserData)
}

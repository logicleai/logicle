import { Kysely } from 'kysely'
import { userRoles as userRoles } from '../../types/user'
import { workspaceRoles } from '../../types/workspace'

const string = 'text'
const timestamp = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('UserRole')
    .addColumn('id', 'integer', (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('User')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull().unique())
    .addColumn('email', string, (col) => col.unique().notNull())
    .addColumn('password', string)
    .addColumn('image', string)
    .addColumn('roleId', 'integer', (col) => col.notNull())
    .addColumn('createdAt', timestamp, (col) => col.notNull())
    .addColumn('updatedAt', timestamp, (col) => col.notNull())
    .addForeignKeyConstraint('fk_User_UserRole', ['roleId'], 'UserRole', ['id'])
    .execute()

  await db.schema
    .createTable('Account')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('userId', string, (col) => col.notNull())
    .addColumn('type', string, (col) => col.notNull())
    .addColumn('provider', string, (col) => col.notNull())
    .addColumn('providerAccountId', string, (col) => col.notNull())
    .addColumn('refresh_token', string)
    .addColumn('access_token', string)
    .addColumn('expires_at', 'real')
    .addColumn('expires_in', 'real')
    .addColumn('token_type', string)
    .addColumn('scope', string)
    .addColumn('id_token', string)
    .addColumn('session_state', string)
    .addForeignKeyConstraint('fk_Account_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createTable('Backend')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('endPoint', string, (col) => col.notNull())
    .addColumn('apiKey', string, (col) => col.notNull())
    .addColumn('providerType', string, (col) => col.notNull())
    .addColumn('modelDetection', string, (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('Assistant')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('icon', string, (col) => col)
    .addColumn('description', string, (col) => col.notNull())
    .addColumn('model', string, (col) => col.notNull())
    .addColumn('systemPrompt', string, (col) => col.notNull())
    .addColumn('backendId', string, (col) => col.notNull())
    .addColumn('tokenLimit', 'integer', (col) => col.notNull())
    .addColumn('temperature', 'real', (col) => col.notNull())
    .addForeignKeyConstraint('fk_Assistant_Backend', ['backendId'], 'Backend', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createTable('Conversation')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('assistantId', string, (col) => col.notNull())
    .addColumn('ownerId', string, (col) => col.notNull())
    .addColumn('createdAt', string, (col) => col.notNull())
    .addForeignKeyConstraint('fk_Conversation_Assistant', ['assistantId'], 'Assistant', ['id'])
    .addForeignKeyConstraint('fk_Conversation_User', ['ownerId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createTable('ConversationFolder')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('ownerId', string, (col) => col.notNull())
    .addForeignKeyConstraint('fk_ConversationFolder_User', ['ownerId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createTable('ConversationFolderMembership')
    .addColumn('folderId', string, (col) => col.notNull())
    .addColumn('conversationId', string, (col) => col.notNull().unique())
    .addPrimaryKeyConstraint('primary_key', ['folderId', 'conversationId'])
    .addForeignKeyConstraint(
      'fk_ConversationFolderMembership_Folder',
      ['folderId'],
      'ConversationFolder',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint(
      'fk_ConversationFolderMembership_Conversation',
      ['conversationId'],
      'Conversation',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createTable('Message')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('conversationId', string, (col) => col.notNull())
    .addColumn('role', string, (col) => col.notNull())
    .addColumn('content', string, (col) => col.notNull())
    .addColumn('sentAt', string, (col) => col.notNull())
    .addColumn('parent', string, (col) => col)
    .addForeignKeyConstraint(
      'fk_Message_Conversation',
      ['conversationId'],
      'Conversation',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('fk_Message_parent_Message', ['parent'], 'Message', ['id'])
    .execute()
  await db.schema.createIndex('Message_sentAt').on('Message').column('sentAt').execute()

  await db.schema
    .createTable('Prompt')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('description', string, (col) => col.notNull())
    .addColumn('content', string, (col) => col.notNull())
    .addColumn('ownerId', string, (col) => col.notNull())
    .addForeignKeyConstraint('fk_Prompt_User', ['ownerId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createTable('Property')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull().unique())
    .addColumn('value', string, (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('Session')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('sessionToken', string, (col) => col.notNull().unique())
    .addColumn('expires', 'timestamp', (col) => col.notNull())
    .addColumn('userId', string, (col) => col.notNull())
    .addForeignKeyConstraint('fk_Session_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createTable('Workspace')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('slug', string, (col) => col.notNull().unique())
    .addColumn('domain', string, (col) => col)
    .addColumn('createdAt', timestamp, (col) => col.notNull())
    .addColumn('updatedAt', timestamp, (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('WorkspaceMember')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('workspaceId', string, (col) => col.notNull())
    .addColumn('userId', string, (col) => col.notNull())
    .addColumn('createdAt', timestamp, (col) => col.notNull())
    .addColumn('updatedAt', timestamp, (col) => col.notNull())
    .addColumn('role', 'text', (col) => col.notNull())
    .addForeignKeyConstraint(
      'fk_WorkspaceMember_Workspace',
      ['workspaceId'],
      'Workspace',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('fk_WorkspaceMember_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createTable('AssistantUserData')
    .addColumn('userId', string, (col) => col.notNull())
    .addColumn('assistantId', string, (col) => col.notNull())
    .addColumn('pinned', 'integer', (col) => col.notNull())
    .addColumn('lastUsed', string, (col) => col)
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

  await db.insertInto('UserRole').values(userRoles).execute()

  await db.schema
    .createTable('File')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('path', string, (col) => col.notNull())
    .addColumn('type', string, (col) => col.notNull())
    .addColumn('size', 'bigint', (col) => col.notNull())
    .addColumn('uploaded', 'integer', (col) => col.notNull())
    .addColumn('createdAt', string, (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('Tool')
    .addColumn('id', string, (col) => col.notNull().primaryKey())
    .addColumn('type', string, (col) => col.notNull())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('configuration', string, (col) => col.notNull())
    .addColumn('updatedAt', string, (col) => col.notNull())
    .addColumn('createdAt', string, (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('AssistantToolAssociation')
    .addColumn('assistantId', string, (col) => col.notNull())
    .addColumn('toolId', string, (col) => col.notNull())
    .addForeignKeyConstraint(
      'fk_AssistantToolAssociation_Assistant',
      ['assistantId'],
      'Assistant',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('fk_AssistantToolAssociation_Tool', ['toolId'], 'Tool', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .addPrimaryKeyConstraint('primary_Assistant_Tool', ['assistantId', 'toolId'])
    .execute()
}

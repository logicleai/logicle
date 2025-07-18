import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Tool')
    .addColumn('sharing', 'text', (col) => col.notNull().defaultTo('public'))
    .execute()
  await db.schema
    .createTable('ToolSharing')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('toolId', 'text', (col) => col.notNull().references('Tool.id'))
    .addColumn('workspaceId', 'text', (col) => col.notNull().references('Workspace.id'))
    .execute()
}

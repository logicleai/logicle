import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('ToolSecret')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('toolId', 'text', (col) => col.notNull())
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .addUniqueConstraint('unique_ToolSecret_toolId_key', ['toolId', 'key'])
    .addForeignKeyConstraint('fk_ToolSecret_Tool', ['toolId'], 'Tool', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema.createIndex('idx_ToolSecret_toolId').on('ToolSecret').column('toolId').execute()
}

import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('UserSecret')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('userId', 'text', (col) => col.notNull())
    .addColumn('context', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .addUniqueConstraint('unique_UserSecret_userId_context_type', ['userId', 'context', 'type'])
    .addForeignKeyConstraint('fk_UserSecret_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createIndex('idx_UserSecret_context')
    .on('UserSecret')
    .column('context')
    .execute()

  await db.schema
    .createIndex('idx_UserSecret_label')
    .on('UserSecret')
    .column('label')
    .execute()
}

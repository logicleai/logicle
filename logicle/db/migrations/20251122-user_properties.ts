import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('UserProperty')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('provisioned', 'integer', (col) => col.notNull().defaultTo(0))
    .addUniqueConstraint('unique_UserProperty_name', ['name'])
    .execute()

  await db.schema
    .createTable('UserPropertyValue')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('userId', 'text', (col) => col.notNull())
    .addColumn('userPropertyId', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addUniqueConstraint('unique_UserPropertyValue_userId_userPropertyId', [
      'userId',
      'userPropertyId',
    ])
    .addForeignKeyConstraint('fk_UserPropertyValue_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .addForeignKeyConstraint(
      'fk_UserPropertyValue_UserProperty',
      ['userPropertyId'],
      'UserProperty',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .execute()
}

import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('Parameter')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('defaultValue', 'text')
    .addColumn('provisioned', 'integer', (col) => col.notNull().defaultTo(0))
    .addUniqueConstraint('unique_Parameter_name', ['name'])
    .execute()

  await db.schema
    .createTable('UserParameterValue')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('userId', 'text', (col) => col.notNull())
    .addColumn('parameterId', 'text', (col) => col.notNull())
    .addColumn('value', 'text', (col) => col.notNull())
    .addUniqueConstraint('unique_UserParameterValue_userId_parameterId', ['userId', 'parameterId'])
    .addForeignKeyConstraint('fk_UserParameterValue_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .addForeignKeyConstraint(
      'fk_UserParameterValue_Parameter',
      ['parameterId'],
      'Parameter',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .execute()
}

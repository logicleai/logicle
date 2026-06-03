import { Kysely } from 'kysely'

const string = 'text'
const timestamp = 'timestamp'

export async function up(db: Kysely<any>): Promise<void> {
  // Add scope column to ApiKey table
  await db.schema
    .alterTable('ApiKey')
    .addColumn('scope', string)
    .execute()

  // Create Satellite table
  await db.schema
    .createTable('Satellite')
    .addColumn('id', string, (col) => col.primaryKey())
    .addColumn('name', string, (col) => col.notNull())
    .addColumn('userId', string, (col) => col.notNull())
    .addColumn('createdAt', timestamp, (col) => col.notNull())
    .addColumn('updatedAt', timestamp, (col) => col.notNull())
    .addForeignKeyConstraint(
      'fk_Satellite_User',
      ['userId'],
      'User',
      ['id'],
      (cb) => cb.onDelete('cascade')
    )
    .execute()

  await db.schema
    .createIndex('Satellite_userId')
    .on('Satellite')
    .columns(['userId'])
    .execute()
}

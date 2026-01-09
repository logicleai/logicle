import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('Session').execute()
  await db.schema
    .createTable('Session')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('userId', 'text', (col) => col.notNull())
    .addColumn('authMethod', 'text', (col) => col.notNull().defaultTo('password'))
    .addColumn('idpConnectionId', 'text', (col) => col.references('IdpConnection.id'))
    .addColumn('createdAt', 'text', (col) => col.notNull().defaultTo(new Date().toISOString()))
    .addColumn('expiresAt', 'timestamp', (col) => col.notNull())
    .addForeignKeyConstraint('fk_Session_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .addForeignKeyConstraint('fk_Session_IdpConnection', ['idpConnectionId'], 'IdpConnection', [
      'id',
    ])
    .execute()
}

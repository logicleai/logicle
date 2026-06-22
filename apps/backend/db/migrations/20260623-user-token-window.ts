import { Kysely } from 'kysely'

const string = 'text'
const timestamp = 'timestamp'
const integer = 'integer'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('UserTokenWindow')
    .addColumn('userId', string, (col) => col.primaryKey())
    .addColumn('tokenWindowStart', timestamp, (col) => col.notNull())
    .addColumn('tokenWindowAccumulated', integer, (col) => col.notNull().defaultTo(0))
    .addForeignKeyConstraint('fk_UserTokenWindow_User', ['userId'], 'User', ['id'], (cb) =>
      cb.onDelete('cascade')
    )
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('UserTokenWindow').execute()
}

import { Dialect, Kysely, SqliteAdapter, SqliteDialect } from 'kysely'

const string = 'text'
const timestamp = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('ApiKey')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('key', string, (col) => col.notNull())
    .addColumn('userId', string, (col) => col.notNull().references('User.id'))
    .addColumn('provisioned', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
}

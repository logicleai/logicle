import { Kysely, sql } from 'kysely'

const string = 'text'
const timestamp = 'text'

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  await db.schema
    .alterTable('User')
    .addColumn('role', 'text', (col) => col.notNull().defaultTo('MEMBER'))
    .execute()
  await db.updateTable('User').set({ role: 'USER' }).where('roleId', '=', 1).execute()
  await db.updateTable('User').set({ role: 'ADMIN' }).where('roleId', '=', 2).execute()

  if (dialect == 'sqlite') {
    // This is for SQLite, kudos to SQLITE for not having drop column
    // BTW... incredibly enough, it is possible to remove tables even if
    // they are targeted by foreign keys
    await db.schema
      .createTable('UserTmp')
      .addColumn('id', string, (col) => col.notNull().primaryKey())
      .addColumn('name', string, (col) => col.notNull().unique())
      .addColumn('email', string, (col) => col.unique().notNull())
      .addColumn('password', string)
      .addColumn('createdAt', timestamp, (col) => col.notNull())
      .addColumn('updatedAt', timestamp, (col) => col.notNull())
      .addColumn('imageId', 'text', (col) => col.references('Image.id').onDelete('set null'))
      .addColumn('role', 'text', (col) => col.notNull().defaultTo('MEMBER'))
      .execute()
    await db
      .insertInto('UserTmp')
      .expression(
        db
          .selectFrom('User')
          .select(['id', 'name', 'email', 'password', 'createdAt', 'updatedAt', 'imageId', 'role'])
      )
      .execute()
    await sql`PRAGMA foreign_keys=0`.execute(db)
    await db.schema.dropTable('User').execute()
    await db.schema.alterTable('UserTmp').renameTo('User').execute()
    await sql`PRAGMA foreign_keys=1`.execute(db)
  } else {
    await db.schema.alterTable('User').dropColumn('roleId').execute()
  }

  await db.schema.dropTable('UserRole').execute()
}

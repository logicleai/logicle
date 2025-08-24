import { Kysely, } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('User')
    .addColumn('ssoUser', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
  await db.updateTable('User').set('ssoUser', '1').where('password', 'is', null).execute()
}

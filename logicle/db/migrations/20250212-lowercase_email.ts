import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db
    .updateTable('User')
    .set('email', sql`LOWER("email")`)
    .execute()
}

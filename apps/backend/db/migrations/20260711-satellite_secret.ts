import { Kysely } from 'kysely'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('Satellite').addColumn('secret', string).execute()
}

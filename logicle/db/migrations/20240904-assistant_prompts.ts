import { Kysely } from 'kysely'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Assistant')
    .addColumn('prompts', 'json', (col) => col.notNull().defaultTo('[]'))
    .execute()
}

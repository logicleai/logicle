import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Assistant')
    .addColumn('prompts', 'json', (col) => col.notNull().defaultTo('[]'))
    .execute()
}

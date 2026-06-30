import { Kysely, } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('Assistant').addColumn('reasoning_effort', 'text').execute()
}

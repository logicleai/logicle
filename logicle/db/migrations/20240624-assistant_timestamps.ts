import { Kysely } from 'kysely'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Assistant')
    .addColumn('createdAt', string, (col) => col.notNull().defaultTo(new Date(0).toISOString()))
    .execute()
  await db.schema
    .alterTable('Assistant')
    .addColumn('updatedAt', string, (col) => col.notNull().defaultTo(new Date(0).toISOString()))
    .execute()
  const now = new Date()
  await db
    .updateTable('Assistant')
    .set({
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    .execute()
}

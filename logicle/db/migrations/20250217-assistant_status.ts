import { Kysely, } from 'kysely'

export async function up(db: Kysely<any>, dialect: 'sqlite' | 'postgresql'): Promise<void> {
  await db.schema
    .alterTable('Assistant')
    .addColumn('deleted', 'integer', (col) => col.notNull().defaultTo('0'))
    .execute()
  /*
  // An example of enums 
  if (dialect == 'sqlite') {
    await db.schema
      .alterTable('Assistant')
      .addColumn('status', 'text', (col) =>
        col
          .notNull()
          .defaultTo('enabled')
          .check(sql`status IN ('enabled', 'disabled')`)
      )
      .execute()
  } else {
    await db.schema.createType('AssistantStatus').asEnum(['enabled', 'disabled']).execute()
    await db.schema
      .alterTable('Assistant')
      .addColumn('status', sql`"AssistantStatus"`, (col) => col.defaultTo('enabled'))
      .execute()
  }
*/
}

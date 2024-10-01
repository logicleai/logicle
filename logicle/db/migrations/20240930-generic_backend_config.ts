import { Kysely } from 'kysely'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('Backend')
    .addColumn('configuration', 'json', (col) => col.notNull().defaultTo('{}'))
    .execute()
  const backends = await db.selectFrom('Backend').selectAll().execute()
  for (const backend of backends) {
    await db
      .updateTable('Backend')
      .set(
        'configuration',
        JSON.stringify({
          apiKey: backend.apiKey,
          endPoint: backend.endPoint,
        })
      )
      .where('id', '=', backend.id)
      .execute()
  }
  await db.schema.alterTable('Backend').dropColumn('modelDetection').execute()
  await db.schema.alterTable('Backend').dropColumn('apiKey').execute()
  await db.schema.alterTable('Backend').dropColumn('endPoint').execute()
}

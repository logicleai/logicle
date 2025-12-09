import { Kysely } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('IdpConnection')
    .addColumn('id', 'text', (col) => col.notNull().primaryKey())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('config', 'text', (col) => col.notNull().defaultTo('{}'))
    .execute()

  const configs = await db
    .selectFrom('JacksonStore')
    .select(['key', 'value'])
    .where('namespace', '=', 'saml:config')
    .execute()
  db.insertInto('IdpConnection')
    .values(
      configs.map((c) => {
        const data = JSON.parse(c.value)
        const type = data.idpMetadata ? 'SAML' : 'OIDC'
        return {
          id: c.key,
          name: data.name,
          description: data.description,
          type: type,
          config: JSON.stringify(type == 'SAML' ? data.idpMetadata : data.oidcProvider),
        }
      })
    )
    .execute()
}

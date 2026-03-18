import { Kysely } from 'kysely'

const string = 'text'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('JacksonStore')
    .addColumn('key', string, (col) => col.notNull().primaryKey())
    .addColumn('namespace', string, (col) => col.notNull())
    .addColumn('value', string, (col) => col.notNull())
    .addColumn('iv', string, (col) => col)
    .addColumn('tag', string, (col) => col)
    .addColumn('createdAt', string, (col) => col)
    .addColumn('expiresAt', string, (col) => col)
    .execute()
  await db.schema
    .createTable('JacksonIndex')
    .addColumn('index', string, (col) => col.notNull())
    .addColumn('key', string, (col) => col.notNull())
    .addForeignKeyConstraint(
      'fk_JacksonIndex_JacksonStore',
      ['key'],
      'JacksonStore',
      ['key'],
      (cb) => cb.onDelete('cascade')
    )
    .execute()
  await db.schema
    .createIndex('JacksonStore_expiresAt')
    .on('JacksonStore')
    .column('expiresAt')
    .execute()
  await db.schema
    .createIndex('JacksonStore_createdAt')
    .on('JacksonStore')
    .column('createdAt')
    .execute()
  await db.schema.createIndex('JacksonIndex_index').on('JacksonIndex').column('index').execute()
  await db.schema.createIndex('JacksonIndex_key').on('JacksonIndex').column('key').execute()
}

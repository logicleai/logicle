import type { Kysely } from 'kysely'

export async function up(db: Kysely<any>) {
  await db.schema
    .createTable('SatelliteTool')
    .addColumn('id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('satelliteId', 'varchar(255)', (col) =>
      col.notNull().references('Satellite.id').onDelete('cascade')
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('inputSchema', 'text') // JSON stringified
    .addColumn('outputSchema', 'text') // JSON stringified
    .addColumn('createdAt', 'timestamp', (col) => col.notNull())
    .addUniqueConstraint('unique_satellite_tool', ['satelliteId', 'name'])
    .execute()
}

export async function down(db: Kysely<any>) {
  await db.schema.dropTable('SatelliteTool').execute()
}

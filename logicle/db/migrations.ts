import { Migrator, Kysely, Migration } from 'kysely'
import createDialect from './dialect'

export async function migrateToLatest() {
  // Here we define the migrations scripts to run.
  // The name of the migration (the key of this map) is very important:
  // * migrations are execute in lexicographical order
  // * if name is changed, migration will fail
  const migrations: Record<string, Migration> = {
    '20240223-initialschema': await import('./migrations/20240223-initialschema'),
    '20240223-jackson': await import('./migrations/20240223-jackson'),
    '20240224-files': await import('./migrations/20240224-files'),
  }

  const db = new Kysely<any>({
    dialect: await createDialect(),
    log: ['query'],
  })

  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async () => migrations,
    },
  })

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was executed successfully`)
    } else if (it.status === 'Error') {
      console.error(`failed to execute migration "${it.migrationName}"`)
    }
  })

  if (error) {
    console.error('failed to migrate')
    console.error(error)
    process.exit(1)
  }

  await db.destroy()
}

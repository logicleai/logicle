import { Migrator, Kysely, Migration } from 'kysely'
import createDialect from './dialect'

export async function migrateToLatest() {
  // Here we define the migrations scripts to run.
  // The name of the migration (the key of this map) is very important:
  // * migrations are execute in lexicographical order
  // * if name is changed, migration will fail
  const migrations: Record<string, Migration> = {
    '20240325-initialschema': await import('./migrations/20240325-initialschema'),
    '20240325-jackson': await import('./migrations/20240325-jackson'),
    '20240404-workspaces': await import('./migrations/20240404-workspaces'),
    '20240531-messageaudit': await import('./migrations/20240531-messageaudit'),
    '20240603-images': await import('./migrations/20240603-images'),
    '20240624-assistant_timestamps': await import('./migrations/20240624-assistant_timestamps'),
    '20240804-assistant_tags': await import('./migrations/20240804-assistant_tags'),
    '20240904-assistant_prompts': await import('./migrations/20240904-assistant_prompts'),
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

import { Migrator, Kysely, Migration, SqliteAdapter, PostgresAdapter } from 'kysely'
import createDialect from './dialect'
import { logger } from '@/lib/logging'
import { migrationModules } from './migrations.generated'

export interface MigrationWithDialect {
  up(db: Kysely<any>, dialect?: 'sqlite' | 'postgresql'): Promise<void>
}

function getDialectName(db: Kysely<any>) {
  if (db.getExecutor().adapter instanceof SqliteAdapter) return 'sqlite'
  else if (db.getExecutor().adapter instanceof PostgresAdapter) return 'postgresql'
  else return undefined
}

export async function migrateToLatest() {
  // Here we define the migrations scripts to run.
  // The name of the migration (the key of this map) is very important:
  // * migrations are execute in lexicographical order
  // * if name is changed, migration will fail
  const migrations = migrationModules

  const dialect = await createDialect()
  const db = new Kysely<any>({
    dialect: dialect,
    log: ['query'],
  })

  const dialectName = getDialectName(db)

  const convertMigration = (migration: MigrationWithDialect): Migration => {
    return {
      up: async (db: Kysely<any>) => {
        await migration.up(db, dialectName)
      },
    }
  }
  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async () => {
        return Object.fromEntries(
          Object.entries(migrations).map(([key, value]) => [key, convertMigration(value)])
        )
      },
    },
  })

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((it) => {
    if (it.status === 'Success') {
      logger.info(`migration "${it.migrationName}" was executed successfully`)
    } else if (it.status === 'Error') {
      logger.error(`failed to execute migration "${it.migrationName}"`)
    }
  })

  if (error) {
    logger.error(`failed to migrate: ${error}`)
    process.exit(1)
  }

  await db.destroy()
}

import { Migrator, Kysely, Migration, SqliteAdapter, PostgresAdapter } from 'kysely'
import createDialect from './dialect'
import { logger } from '@/lib/logging'

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
  const migrations: Record<string, MigrationWithDialect> = {
    '20240325-initialschema': await import('./migrations/20240325-initialschema'),
    '20240325-jackson': await import('./migrations/20240325-jackson'),
    '20240404-workspaces': await import('./migrations/20240404-workspaces'),
    '20240531-messageaudit': await import('./migrations/20240531-messageaudit'),
    '20240603-images': await import('./migrations/20240603-images'),
    '20240624-assistant_timestamps': await import('./migrations/20240624-assistant_timestamps'),
    '20240804-assistant_tags': await import('./migrations/20240804-assistant_tags'),
    '20240904-assistant_prompts': await import('./migrations/20240904-assistant_prompts'),
    '20240930-generic_backend_config': await import('./migrations/20240930-generic_backend_config'),
    '20241118-backend_tool_provisioning': await import(
      './migrations/20241118-backend_tool_provisioning'
    ),
    '20241119-userrole_dbenum': await import('./migrations/20241119-userrole_dbenum'),
    '20241123-apikeys_and_userprovision': await import(
      './migrations/20241123-apikeys_and_userprovision'
    ),
    '20241209-assistant_provisioning': await import('./migrations/20241209-assistant_provisioning'),
    '20241210-file_encryption': await import('./migrations/20241210-file_encryption'),
    '20241211-user_preferences': await import('./migrations/20241211-user_preferences'),
    '20250212-lowercase_email': await import('./migrations/20250212-lowercase_email'),
    '20250215-id_assistantsharing': await import('./migrations/20250215-id_assistantsharing'),
    '20250216-conversation_indexes': await import('./migrations/20250216-conversation_indexes'),
  }

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

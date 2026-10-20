import { db } from '@/db/database'
import env from '@/lib/env'
import { storage } from '@/lib/storage'
import { reencryptFileBlobs, type ReencryptOptions } from '@/lib/storage/reencryptFileBlobs'
import { sql } from 'kysely'

const usage = () => {
  console.error('Usage: reencrypt-file-blobs [--apply] [--limit N] [--continue-on-error]')
  console.error('Without --apply the command only reports the plaintext backlog.')
}

const parseOptions = (): ReencryptOptions => {
  const args = process.argv.slice(2)
  let apply = false
  let limit: number | undefined
  let continueOnError = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--limit') {
      const value = Number(args[++index])
      if (!Number.isSafeInteger(value) || value <= 0) {
        usage()
        process.exit(2)
      }
      limit = value
      continue
    }
    if (arg === '--continue-on-error') {
      continueOnError = true
      continue
    }
    usage()
    process.exit(2)
  }
  return { apply, limit, continueOnError }
}

const main = async () => {
  try {
    const options = parseOptions()
    if (!options.apply) {
      await reencryptFileBlobs(db, storage, options)
      return
    }
    if (!env.databaseUrl.startsWith('postgresql:') && !env.databaseUrl.startsWith('postgres:')) {
      throw new Error('--apply currently requires PostgreSQL for the advisory lock')
    }
    if (env.fileStorage.encryptionProvider !== 'aead' || !env.fileStorage.encryptionKey) {
      throw new Error(
        '--apply requires FILE_STORAGE_ENCRYPTION_PROVIDER=aead and a nonempty FILE_STORAGE_ENCRYPTION_KEY'
      )
    }
    // Session-level advisory locks must be acquired and released on the same connection.
    await db.connection().execute(async (connection) => {
      await sql`select pg_advisory_lock(hashtext('logicle:fileblob-reencrypt'))`.execute(connection)
      try {
        await reencryptFileBlobs(connection, storage, options)
      } finally {
        await sql`select pg_advisory_unlock(hashtext('logicle:fileblob-reencrypt'))`.execute(
          connection
        )
      }
    })
  } finally {
    await db.destroy()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

import fs from 'node:fs'
import path from 'node:path'
import * as PG from 'pg'
import { SqliteDialect, PostgresDialect, Dialect } from 'kysely'
import env from '../lib/env'
import { logger } from '@/lib/logging'

const toIsoTimestamp = (value: string) => {
  return value.replace(' ', 'T') + 'Z'
}

async function createDialect() {
  let dialect: Dialect

  let dbUrlString = env.databaseUrl
  if (dbUrlString === 'undefined') {
    dbUrlString = 'memory:'
  }
  const url = new URL(dbUrlString)
  logger.info(`Connecting to db @${url}`)
  if (url.protocol === 'file:' || url.protocol === 'memory:') {
    const dirName = path.dirname(url.pathname)
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true })
    }
    const sqliteModule = await import('better-sqlite3')
    dialect = new SqliteDialect({
      database: new sqliteModule.default(url.pathname),
    })
  } else {
    // Disable JSON parsing, we will do the JSON parsing because sqlite does not
    // know anything about JSON
    PG.types.setTypeParser(114, 'text', (value) => {
      return value
    })
    PG.types.setTypeParser(20, 'text', (value) => {
      return parseInt(value, 10)
    })
    PG.types.setTypeParser(1114, 'text', (value) => {
      return toIsoTimestamp(value)
    })
    dialect = new PostgresDialect({
      pool: new PG.Pool({
        database: url.pathname.substring(1),
        host: url.hostname,
        user: url.username,
        password: url.password,
        port: parseInt(url.port, 10),
        max: 10,
      }),
    })
  }
  return dialect
}

export default createDialect

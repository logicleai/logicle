import { Pool } from 'pg'
import { SqliteDialect, PostgresDialect, Dialect } from 'kysely'
import env from '../lib/env'

async function createDialect() {
  let dialect: Dialect

  let dbUrlString = env.databaseUrl
  if (dbUrlString == 'undefined') {
    dbUrlString = 'memory:'
  }
  const url = new URL(dbUrlString)
  console.log(`Connecting to db @${url}`)
  if (url.protocol == 'file:' || url.protocol == 'memory:') {
    const sqliteModule = await import('better-sqlite3')
    dialect = new SqliteDialect({
      database: new sqliteModule.default(url.pathname),
    })
  } else {
    dialect = new PostgresDialect({
      pool: new Pool({
        database: url.pathname.substring(1),
        host: url.hostname,
        user: url.username,
        password: url.password,
        port: url.port,
        max: 10,
      }),
    })
  }
  return dialect
}

export default createDialect

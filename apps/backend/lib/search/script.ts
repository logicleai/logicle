import { Kysely } from 'kysely'
import type { DB } from '../../db/schema.ts'
import createDialect from '../../db/dialect.ts'
import { MeiliSearchIndex } from './MeiliIndex.ts'
import { runWorker } from './indexer.ts'

const db = new Kysely<DB>({ dialect: await createDialect() })
const index = await MeiliSearchIndex.create()
await runWorker(db, index)

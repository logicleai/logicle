import { Kysely } from 'kysely'
import type { DB } from '@/db/schema'
import createDialect from '@/db/dialect'
import { MeiliSearchIndex } from './MeiliIndex'
import { runWorker } from './indexer'

const db = new Kysely<DB>({ dialect: await createDialect() })
const index = await MeiliSearchIndex.create()
await runWorker(db, index)

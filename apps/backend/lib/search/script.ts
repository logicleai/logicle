import { Kysely } from 'kysely'
import type { DB } from '../../db/schema.ts'
import createDialect from '../../db/dialect.ts'
import { MeiliSearchIndex } from './MeiliIndex.ts'
import { runWorker } from './indexer.ts'

const db = new Kysely<DB>({ dialect: await createDialect() })

let index: MeiliSearchIndex | undefined
while (!index) {
  try {
    index = await MeiliSearchIndex.create()
  } catch (err) {
    console.error('[search] Meilisearch unavailable, retrying in 10s…', (err as Error).message)
    await new Promise((r) => setTimeout(r, 10_000))
  }
}

await runWorker(db, index)

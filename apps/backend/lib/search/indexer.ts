import type { Kysely } from 'kysely'
import type { DB } from '../../db/schema.ts'
import type { ConversationIndexDoc, ConversationRow, ConversationSearchDoc, ConversationIndex } from './Index'
import { logger } from '../logging.ts'

const BATCH_SIZE = Number(process.env.HEAL_BATCH_SIZE ?? 500)
const SLEEP_MS = Number(process.env.SEARCH_SYNC_SLEEP_MS ?? 2_000)

export let stopRequested = false

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getDocumentsById(db: Kysely<DB>, ids: string[]): Promise<ConversationSearchDoc[]> {
  if (ids.length === 0) return []

  const conversations = await db.selectFrom('Conversation').selectAll().where('id', 'in', ids).execute()
  const messages = await db
    .selectFrom('Message')
    .selectAll()
    .where('conversationId', 'in', ids)
    .orderBy('sentAt asc')
    .execute()

  const messagesByConv = new Map<string, typeof messages>()
  for (const m of messages) {
    if (!messagesByConv.has(m.conversationId)) messagesByConv.set(m.conversationId, [])
    messagesByConv.get(m.conversationId)!.push(m)
  }

  return conversations.map((conv) => {
    const msgs = (messagesByConv.get(conv.id) ?? []).map((m) => ({
      ...m,
      content: JSON.parse(m.content),
    }))
    return {
      id: conv.id,
      title: conv.name,
      ownerId: conv.ownerId,
      assistantId: conv.assistantId,
      createdAt: conv.createdAt,
      lastMsgSentAt: conv.lastMsgSentAt,
      messages: msgs,
    }
  })
}

async function fetchUpdatedAfter(db: Kysely<DB>, since: string, limit = 1000): Promise<ConversationRow[]> {
  return db
    .selectFrom('Conversation')
    .select(['id', 'lastMsgSentAt'])
    .where('lastMsgSentAt', '>', since)
    .orderBy('lastMsgSentAt', 'asc')
    .limit(limit)
    .execute()
}

async function fetchAfterId(db: Kysely<DB>, fromId: string, maxResults: number): Promise<ConversationRow[]> {
  return db
    .selectFrom('Conversation')
    .select(['id', 'lastMsgSentAt'])
    .where('id', '>', fromId)
    .orderBy('id', 'asc')
    .limit(maxResults)
    .execute()
}

async function syncIncremental(db: Kysely<DB>, index: ConversationIndex, since: string) {
  let updated = 0
  let cursor = since
  while (!stopRequested) {
    const rows = await fetchUpdatedAfter(db, cursor)
    if (rows.length === 0) break
    const docs = await getDocumentsById(db, rows.map((r) => r.id))
    await index.addDocuments(docs)
    updated += docs.length
    cursor = rows[rows.length - 1]!.lastMsgSentAt ?? since
  }
  if (updated) logger.info(`[search:incremental] upserted ${updated} docs`)
  return { cursor, updated }
}

function getMin(r1: string | null, r2: string | null): string | null {
  if (r1 == null) return r2
  if (r2 == null) return r1
  return r1 < r2 ? r1 : r2
}

export type RangeDiff = {
  /** Upper bound of the range processed; null means end of data was reached on both sides */
  to: string | null
  toUpsert: string[]
  toDelete: string[]
}

/**
 * Pure function: given two sorted slices of the DB and index, compute which
 * ids need to be upserted or deleted to bring the index in sync.
 * Returns null when both slices are empty (heal is complete).
 */
export function diffRanges(
  dbEntries: ConversationIndexDoc[],
  idxEntries: ConversationIndexDoc[],
  batchSize: number
): RangeDiff | null {
  if (dbEntries.length === 0 && idxEntries.length === 0) return null

  const lastDb = dbEntries.length < batchSize ? null : dbEntries[dbEntries.length - 1]!.id
  const lastIdx = idxEntries.length < batchSize ? null : idxEntries[idxEntries.length - 1]!.id
  const to = getMin(lastDb, lastIdx)

  const db = to != null ? dbEntries.filter((e) => e.id <= to) : dbEntries
  const idx = to != null ? idxEntries.filter((e) => e.id <= to) : idxEntries

  const indexById = new Map(idx.map((e) => [e.id, e]))
  const dbById = new Map(db.map((e) => [e.id, e]))

  const toUpsert = db
    .filter((row) => {
      const existing = indexById.get(row.id)
      return !existing || row.lastMsgSentAt !== existing.lastMsgSentAt
    })
    .map((row) => row.id)

  const toDelete = idx.filter((doc) => !dbById.has(doc.id)).map((doc) => doc.id)

  return { to, toUpsert, toDelete }
}

async function healNextRange(db: Kysely<DB>, index: ConversationIndex, from: string): Promise<string | null> {
  const dbEntries = await fetchAfterId(db, from, BATCH_SIZE)
  const idxEntries = await index.fetchEntriesAfterId(from, BATCH_SIZE)

  const diff = diffRanges(dbEntries, idxEntries, BATCH_SIZE)
  if (diff === null) return null

  const { to, toUpsert, toDelete } = diff

  if (toUpsert.length) {
    const docs = await getDocumentsById(db, toUpsert)
    await index.addDocuments(docs)
    logger.info(`[search:heal] upserted ${toUpsert.length} in range (${from} ... ${to})`)
  }
  if (toDelete.length) {
    await index.deleteDocuments(toDelete)
    logger.info(`[search:heal] deleted ${toDelete.length} in range (${from} ... ${to})`)
  }

  return to
}

export async function runWorker(db: Kysely<DB>, index: ConversationIndex) {
  let lastSync = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let healCursor = ' '

  logger.info('[search] Sync worker started')
  while (!stopRequested) {
    try {
      const start = Date.now()
      const result = await syncIncremental(db, index, lastSync)
      lastSync = result.cursor
      const nextCursor = await healNextRange(db, index, healCursor)
      healCursor = nextCursor ?? ' '
      logger.info(`[search] Loop done. Heal cursor="${healCursor}". Elapsed ${Date.now() - start}ms`)
    } catch (err) {
      logger.error('[search] Sync iteration failed, will retry:', (err as Error).message)
    }
    await sleep(SLEEP_MS)
  }
  logger.info('[search] Sync worker stopping')
}

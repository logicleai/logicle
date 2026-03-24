import type { Kysely } from 'kysely'
import type { DB } from '@/db/schema'
import type { ConversationIndexDoc, ConversationRow, ConversationSearchDoc, ConversationIndex } from './Index'

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
  if (updated) console.log(`[search:incremental] upserted ${updated} docs`)
  return { cursor, updated }
}

function getMin(r1: string | null, r2: string | null): string | null {
  if (r1 == null) return r2
  if (r2 == null) return r1
  return r1 < r2 ? r1 : r2
}

async function healNextRange(db: Kysely<DB>, index: ConversationIndex, from: string): Promise<string | null> {
  let dbEntries = await fetchAfterId(db, from, BATCH_SIZE)
  let idxEntries = await index.fetchEntriesAfterId(from, BATCH_SIZE)

  if (dbEntries.length === 0 && idxEntries.length === 0) return null

  const lastDb = dbEntries.length < BATCH_SIZE ? null : dbEntries[dbEntries.length - 1]!.id
  const lastIdx = idxEntries.length < BATCH_SIZE ? null : idxEntries[idxEntries.length - 1]!.id
  const to = getMin(lastDb, lastIdx)

  if (to != null) {
    dbEntries = dbEntries.filter((f) => f.id <= to)
    idxEntries = idxEntries.filter((f) => f.id <= to)
  }

  const indexById = new Map<string, ConversationIndexDoc>()
  const dbById = new Map<string, ConversationIndexDoc>()
  for (const doc of dbEntries) dbById.set(doc.id, doc)
  for (const doc of idxEntries) indexById.set(doc.id, doc)

  const toUpsert: string[] = []
  const toDelete: string[] = []

  for (const row of dbEntries) {
    const existing = indexById.get(row.id)
    if (!existing || row.lastMsgSentAt !== existing.lastMsgSentAt) toUpsert.push(row.id)
  }
  for (const doc of idxEntries) {
    if (!dbById.has(doc.id)) toDelete.push(doc.id)
  }

  if (toUpsert.length) {
    const docs = await getDocumentsById(db, toUpsert)
    await index.addDocuments(docs)
    console.log(`[search:heal] upserted ${toUpsert.length} in range (${from} ... ${to})`)
  }
  if (toDelete.length) {
    await index.deleteDocuments(toDelete)
    console.log(`[search:heal] deleted ${toDelete.length} in range (${from} ... ${to})`)
  }

  return to
}

export async function runWorker(db: Kysely<DB>, index: ConversationIndex) {
  let lastSync = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let healCursor = ' '

  console.log('[search] Sync worker started')

  try {
    while (!stopRequested) {
      const start = Date.now()
      const result = await syncIncremental(db, index, lastSync)
      lastSync = result.cursor
      const nextCursor = await healNextRange(db, index, healCursor)
      healCursor = nextCursor ?? ' '
      console.log(`[search] Loop done. Heal cursor="${healCursor}". Elapsed ${Date.now() - start}ms`)
      await sleep(SLEEP_MS)
    }
  } catch (err) {
    console.error('[search] Sync worker failed:', err)
  } finally {
    console.log('[search] Sync worker stopping')
  }
}

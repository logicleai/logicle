import * as meili from 'meilisearch'
import env from '../../../../packages/core/src/env.ts'
import type { ConversationRow, ConversationSearchDoc, ConversationSearchResult, ConversationIndex } from './Index'

const CONVERSATION_INDEX = 'conversations'

const toHex = (s: string) => Buffer.from(s).toString('hex')
const fromHex = (s: string) => Buffer.from(s, 'hex').toString()

export class MeiliSearchIndex implements ConversationIndex {
  private index: meili.Index<ConversationSearchDoc>

  constructor(index: meili.Index<ConversationSearchDoc>) {
    this.index = index
  }

  async addDocuments(docs: ConversationSearchDoc[]) {
    await this.index.addDocuments(
      docs.map((doc) => ({ ...doc, id: toHex(doc.id) })),
      { primaryKey: 'id' }
    )
  }

  async deleteDocuments(ids: string[]) {
    await this.index.deleteDocuments(ids.map(toHex))
  }

  async fetchEntriesAfterId(fromId: string, maxResults: number): Promise<ConversationRow[]> {
    const res = await this.index.search(null, {
      filter: `id > "${toHex(fromId)}"`,
      sort: ['id:asc'],
      attributesToRetrieve: ['id', 'lastMsgSentAt'],
      limit: maxResults,
    })
    return res.hits.map((h) => ({
      id: fromHex(h.id),
      lastMsgSentAt: h.lastMsgSentAt,
    })) satisfies ConversationRow[]
  }

  async searchConversations(
    query: string,
    opts?: { limit?: number; ownerId?: string; assistantId?: string }
  ): Promise<ConversationSearchResult[]> {
    const filter: string[] = []
    if (opts?.ownerId) filter.push(`ownerId = "${opts.ownerId}"`)
    if (opts?.assistantId) filter.push(`assistantId = "${opts.assistantId}"`)

    const res = await this.index.search<ConversationSearchDoc>(query, {
      limit: opts?.limit ?? 10,
      filter: filter.length ? filter.join(' AND ') : undefined,
      attributesToCrop: ['messages'],
      cropLength: 60,
      attributesToHighlight: ['messages'],
      highlightPreTag: '<em>',
      highlightPostTag: '</em>',
    })

    return res.hits.map((hit: meili.Hit<ConversationSearchDoc>, idx) => ({
      id: fromHex(hit.id),
      title: hit.title,
      createdAt: hit.createdAt,
      lastMsgSentAt: hit.lastMsgSentAt,
      score: (hit as any)._rankingScore ?? (res.estimatedTotalHits ?? 0) - idx,
      snippet: (hit._formatted as any) ?? '',
    }))
  }

  static async create(): Promise<MeiliSearchIndex> {
    const client = new meili.MeiliSearch({
      host: env.search.meiliHost!,
      apiKey: env.search.meiliApiKey,
    })

    let index: meili.Index<ConversationSearchDoc>
    try {
      index = await client.getIndex<ConversationSearchDoc>(CONVERSATION_INDEX)
    } catch (err: any) {
      if (err?.code !== 'index_not_found') throw err
      const task = await client.createIndex(CONVERSATION_INDEX, { primaryKey: 'id' })
      await client.waitForTask(task.taskUid)
      index = client.index<ConversationSearchDoc>(CONVERSATION_INDEX)
    }

    const settingsTask = await index.updateSettings({
      searchableAttributes: ['title', 'messages'],
      displayedAttributes: ['id', 'title', 'ownerId', 'assistantId', 'createdAt', 'lastMsgSentAt', 'messages'],
      filterableAttributes: ['id', 'ownerId', 'assistantId'],
      sortableAttributes: ['id', 'createdAt', 'lastMsgSentAt'],
    })
    await index.waitForTask(settingsTask.taskUid)

    return new MeiliSearchIndex(index)
  }
}

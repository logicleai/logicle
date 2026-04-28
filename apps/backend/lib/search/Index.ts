export interface ConversationIndexDoc {
  id: string
  lastMsgSentAt: string | null
}

export interface ConversationSearchDoc {
  id: string
  title: string
  ownerId: string
  assistantId: string
  createdAt: string
  lastMsgSentAt: string | null
  messages: Record<string, unknown>[]
}

export interface ConversationSearchResult {
  id: string
  title: string
  createdAt: string
  lastMsgSentAt: string | null
  score: number
  snippet: Record<string, unknown>
}

export interface ConversationRow {
  id: string
  lastMsgSentAt: string | null
}

export interface ConversationIndex {
  addDocuments(docs: ConversationSearchDoc[]): Promise<unknown>
  deleteDocuments(ids: string[]): Promise<unknown>
  fetchEntriesAfterId(fromId: string, maxResults: number): Promise<ConversationRow[]>
  searchConversations(
    query: string,
    opts?: {
      limit?: number
      ownerId?: string
      assistantId?: string
    }
  ): Promise<ConversationSearchResult[]>
}

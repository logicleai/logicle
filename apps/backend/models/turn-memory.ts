import { db } from 'db/database'
import { nanoid } from 'nanoid'

export interface TurnMemoryRecord {
  id: string
  conversationId: string
  userMessageId: string
  userIntent: string
  answerSummary: string
  durableFacts: string
  openQuestions: string
  decisions: string
  rehydrationHints: string
  warnings: string
  createdAt: string
}

export interface SaveTurnMemoryParams {
  conversationId: string
  userMessageId: string
  userIntent: string
  answerSummary: string
  durableFacts: unknown[]
  openQuestions: string[]
  decisions: string[]
  rehydrationHints: unknown[]
  warnings: string[]
}

export const saveTurnMemory = async (params: SaveTurnMemoryParams): Promise<void> => {
  await db
    .insertInto('TurnMemory')
    .values({
      id: nanoid(),
      conversationId: params.conversationId,
      userMessageId: params.userMessageId,
      userIntent: params.userIntent,
      answerSummary: params.answerSummary,
      durableFacts: JSON.stringify(params.durableFacts),
      openQuestions: JSON.stringify(params.openQuestions),
      decisions: JSON.stringify(params.decisions),
      rehydrationHints: JSON.stringify(params.rehydrationHints),
      warnings: JSON.stringify(params.warnings),
      createdAt: new Date().toISOString(),
    })
    .execute()
}

export const getTurnMemoriesForConversation = async (
  conversationId: string
): Promise<TurnMemoryRecord[]> => {
  return db
    .selectFrom('TurnMemory')
    .selectAll()
    .where('conversationId', '=', conversationId)
    .orderBy('createdAt', 'asc')
    .execute()
}

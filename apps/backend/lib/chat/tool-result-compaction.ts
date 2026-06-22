import * as dto from '@/types/dto'
import { getTurnMemoriesForConversation } from '@/models/turn-memory'

/**
 * When context compression is active, replaces old-turn tool messages with
 * compact summaries and strips attachment content from historical user messages.
 *
 * - `conservative`: compacts old tool outputs + strips old user-message attachments
 * - `aggressive`:   same as conservative + also strips current-turn attachments
 *
 * Tool messages and attachments that belong to the current (last) user turn are
 * left untouched for the `conservative` preset so the model can still reason
 * over them.
 */
export async function compactHistoricalToolResultsForPrompt(
  messages: dto.Message[],
  conversationId: string | undefined,
  preset: dto.ContextCompressionPreset
): Promise<dto.Message[]> {
  if (!conversationId) return messages

  const turnMemories = await getTurnMemoriesForConversation(conversationId)
  const memoryByUserMessageId = new Map(turnMemories.map((m) => [m.userMessageId, m]))

  // Find the ID of the last user/user-response message — that's the current turn.
  let currentTurnUserMessageId: string | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i]!.role
    if (role === 'user' || role === 'user-response') {
      currentTurnUserMessageId = messages[i]!.id
      break
    }
  }

  let activeTurnUserMessageId: string | undefined
  return messages.map((msg) => {
    if (msg.role === 'user' || msg.role === 'user-response') {
      activeTurnUserMessageId = msg.id
      const isCurrentTurn = msg.id === currentTurnUserMessageId
      const stripAttachments = !isCurrentTurn || preset === 'aggressive'
      if (stripAttachments && msg.role === 'user') {
        return stripUserMessageAttachments(msg as dto.UserMessage)
      }
      return msg
    }

    if (
      msg.role === 'tool' &&
      activeTurnUserMessageId !== undefined &&
      activeTurnUserMessageId !== currentTurnUserMessageId
    ) {
      const memory = memoryByUserMessageId.get(activeTurnUserMessageId)
      if (memory) {
        return compactToolMessage(msg as dto.ToolMessage, memory.answerSummary)
      }
    }

    return msg
  })
}

function stripUserMessageAttachments(msg: dto.UserMessage): dto.UserMessage {
  if (!msg.attachments || msg.attachments.length === 0) return msg
  const names = msg.attachments.map((a) => a.name).join(', ')
  const descriptor = `[Files attached in this turn (content not re-sent): ${names}]`
  return {
    ...msg,
    content: descriptor + (msg.content ? '\n' + msg.content : ''),
    attachments: [],
  }
}

function compactToolMessage(msg: dto.ToolMessage, answerSummary: string): dto.ToolMessage {
  const compactedParts: dto.ToolCallResultPart[] = msg.parts
    .filter((p): p is dto.ToolCallResultPart => p.type === 'tool-result')
    .map((p) => ({
      ...p,
      result: {
        type: 'text' as const,
        value: `[Tool output summarized for context efficiency. Turn summary: ${answerSummary}]`,
      },
    }))

  return { ...msg, parts: compactedParts }
}

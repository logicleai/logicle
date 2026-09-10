import type * as dto from '@/types/dto'
import type { CorpusDocument, ReferenceChat } from './types'

interface MaterializeReferenceChatOptions {
  conversationId: string
  runId: string
  files: dto.AssistantFile[]
  corpus: CorpusDocument[]
}

/** Converts a saved, portable reference chat into the exact DTO history ChatAssistant consumes. */
export const materializeReferenceChat = (
  referenceChat: ReferenceChat,
  options: MaterializeReferenceChatOptions
): dto.Message[] => {
  const { conversationId, runId, files, corpus } = options
  const filesByName = new Map(files.map((file) => [file.name, file]))
  const corpusNames = new Set(corpus.map((document) => document.name))
  const messages: dto.Message[] = []
  const sentAt = (index: number) => new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()

  for (const [index, reference] of referenceChat.history.entries()) {
    const base = {
      id: `eval-history-${runId}-${index}`,
      conversationId,
      parent: messages.at(-1)?.id ?? null,
      sentAt: sentAt(index),
    }

    if (reference.role === 'user') {
      const attachments = (reference.attachments ?? []).map((name) => {
        if (!corpusNames.has(name)) {
          throw new Error(`Reference chat attachment "${name}" is missing from the scenario corpus`)
        }
        const file = filesByName.get(name)
        if (!file) throw new Error(`Reference chat attachment "${name}" was not materialized`)
        return { id: file.id, name: file.name, mimetype: file.type, size: file.size }
      })
      messages.push({ ...base, role: 'user', content: reference.text, attachments })
      continue
    }

    if (reference.role === 'assistant') {
      const parts: dto.AssistantMessagePart[] = []
      if (reference.text) parts.push({ type: 'text', text: reference.text })
      if (reference.toolCall) {
        parts.push({
          type: 'tool-call',
          toolCallId: reference.toolCall.id,
          toolName: reference.toolCall.name,
          args: reference.toolCall.args,
        })
      }
      messages.push({
        ...base,
        role: 'assistant',
        parts,
        finishReason: reference.toolCall ? 'tool-calls' : 'stop',
      })
      continue
    }

    messages.push({
      ...base,
      role: 'tool',
      parts: [
        {
          type: 'tool-result',
          toolCallId: reference.toolCallId,
          toolName: reference.toolName,
          result: { type: 'text', value: reference.result },
        },
      ],
    })
  }

  return messages
}

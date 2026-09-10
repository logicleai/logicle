import {
  ToolImplementation,
  ToolParams,
  ToolFunctions,
  ToolFunctionContext,
  ToolInvokeParams,
} from '@/lib/chat/tools'
import { db } from '@/db/database'
import { LlmModel } from '@/lib/chat/models'
import { cachingExtractor } from '@/lib/textextraction/cache'
import type { FileDbRow } from '@/backend/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import {
  canSendAsNativeFile,
  canSendAsNativeImage,
} from '@/backend/lib/chat/file-attachment-policy'
import { renderMessagePlainText } from '@/backend/lib/chat/message-projection'
import {
  findRelevantExcerpts,
  findRelevantMessageExcerpts,
} from '@/backend/lib/chat/context-search'
import type * as dto from '@/types/dto'

const isTextLikeMimeType = (mimeType: string) =>
  mimeType.startsWith('text/') || mimeType === 'application/json'

const MAX_SEARCH_RESULTS = 20

/**
 * Exposes the chat's own uncompressed context back to the model: read a file by id, read a
 * message's original content by id, or search the conversation's message history for a query.
 * `get_message`/`search` operate on the live `messages` handed to `invoke` — the same
 * `ChatState.chatHistory` compression never mutates — so they need no extra DB access or
 * authorization beyond already being inside this conversation. See docs/context-compression.md.
 */
export class ContextRetrievePlugin implements ToolImplementation {
  static toolName = 'context-retrieve'
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    public params: Record<string, never>
  ) {}

  functions = async (_model: LlmModel, _context: ToolFunctionContext) => this.functions_

  private async getFileDbRowBy(where: { id: string }): Promise<FileDbRow | undefined> {
    let query = db.selectFrom('File').selectAll()
    query = query.where('id', '=', where.id)
    const file = await query.executeTakeFirst()
    if (!file) return undefined
    const blob = file.fileBlobId
      ? await db
          .selectFrom('FileBlob')
          .select(['size', 'encryption'])
          .where('id', '=', file.fileBlobId)
          .executeTakeFirst()
      : undefined
    return {
      ...file,
      size: blob?.size ?? (file as any).size,
      encryption: blob?.encryption ?? (file as any).encryption,
    } as FileDbRow
  }

  private findMessage(messages: dto.Message[], id: string): dto.Message | undefined {
    return messages.find((m) => m.id === id)
  }

  functions_: ToolFunctions = {
    get_file: {
      description:
        'Read file content on-demand by file id. Returns text directly, or a file attachment when the model can consume that media type.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'file id',
          },
        },
        additionalProperties: false,
        required: ['id'],
      },
      invoke: async ({ llmModel, params, userId }) => {
        const fileEntry = await this.getFileDbRowBy({ id: `${params.id}` })
        if (!fileEntry) {
          return {
            type: 'error-text',
            value: 'File not found',
          }
        }
        if (!(await canAccessFile({ userId }, fileEntry.id))) {
          return {
            type: 'error-text',
            value: 'File not found',
          }
        }
        const extractedText = isTextLikeMimeType(fileEntry.type)
          ? await cachingExtractor.extractFromFile(fileEntry)
          : null
        if (typeof extractedText === 'string' && extractedText.length > 0) {
          return {
            type: 'text',
            value: extractedText,
          }
        }
        if (
          canSendAsNativeImage(fileEntry.type, llmModel.capabilities) ||
          canSendAsNativeFile(fileEntry.type, llmModel.capabilities)
        ) {
          return {
            type: 'content',
            value: [
              {
                type: 'file',
                id: fileEntry.id,
                size: fileEntry.size ?? 0,
                name: fileEntry.name,
                mimetype: fileEntry.type,
                uiHidden: true,
              },
            ],
          }
        }
        const fallbackText = isTextLikeMimeType(fileEntry.type)
          ? extractedText
          : await cachingExtractor.extractFromFile(fileEntry)
        if (typeof fallbackText === 'string' && fallbackText.length > 0) {
          return {
            type: 'text',
            value: fallbackText,
          }
        }
        return {
          type: 'error-text',
          value: `The content of the file "${fileEntry.name}" with id ${fileEntry.id} could not be extracted.`,
        }
      },
    },
    get_message: {
      description:
        "Read a message's original, uncompressed content from this conversation by its message id. Use this when context compression has replaced a message with a summary and the exact original content is needed.",
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'message id',
          },
        },
        additionalProperties: false,
        required: ['id'],
      },
      invoke: async ({ messages, params }: ToolInvokeParams) => {
        const message = this.findMessage(messages, `${params.id}`)
        if (!message) {
          return {
            type: 'error-text',
            value: 'Message not found',
          }
        }
        return {
          type: 'text',
          value: renderMessagePlainText(message),
        }
      },
    },
    search: {
      description:
        "Search original, uncompressed context using focused terms from the user's request. When id is supplied, returns small relevant excerpts from that exact message or file; prefer this targeted form for a compression marker. Without id, searches the conversation and returns matching message ids. Use get_message or get_file only when the excerpts are insufficient.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'text to search for',
          },
          id: {
            type: 'string',
            description: 'optional compressed message or file id to search within',
          },
        },
        additionalProperties: false,
        required: ['query'],
      },
      invoke: async ({ messages, params, userId }: ToolInvokeParams) => {
        const query = `${params.query}`.trim()
        if (!query) {
          return { type: 'error-text', value: 'Empty search query' }
        }
        const id = typeof params.id === 'string' ? params.id.trim() : ''
        if (id) {
          const message = this.findMessage(messages, id)
          let targetText: string | undefined
          let targetKind = 'message'
          if (message) {
            targetText = renderMessagePlainText(message)
          } else {
            const file = await this.getFileDbRowBy({ id })
            if (!file || !(await canAccessFile({ userId }, file.id))) {
              return { type: 'error-text', value: 'Message or file not found' }
            }
            targetKind = 'file'
            const extracted = await cachingExtractor.extractFromFile(file)
            if (typeof extracted === 'string' && extracted.length > 0) targetText = extracted
          }
          if (!targetText) {
            return { type: 'error-text', value: `No searchable text found for ${targetKind} ${id}` }
          }
          const excerpts = findRelevantExcerpts(targetText, query)
          if (excerpts.length === 0) {
            return { type: 'text', value: `No relevant excerpts found in ${targetKind} ${id}.` }
          }
          return {
            type: 'text',
            value: `Relevant excerpts from ${targetKind} ${id}:\n\n${excerpts.join('\n\n---\n\n')}`,
          }
        }
        // The invocation receives the live turn too. Search only the context that existed before
        // the latest user request, otherwise a context-retrieve call can rank its own arguments
        // and result above the historical message it is trying to recover.
        let currentTurnStart = -1
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index]?.role === 'user') {
            currentTurnStart = index
            break
          }
        }
        const historicalMessages =
          currentTurnStart === -1 ? messages : messages.slice(0, currentTurnStart)
        const matches = findRelevantMessageExcerpts(
          historicalMessages.map((message) => ({
            id: message.id,
            role: message.role,
            text: renderMessagePlainText(message),
          })),
          query,
          MAX_SEARCH_RESULTS
        ).map(({ id: messageId, role, excerpt }) =>
          `id: ${messageId} (role: ${role})\n${excerpt}`
        )
        if (matches.length === 0) {
          return { type: 'text', value: `No messages matched "${query}".` }
        }
        return { type: 'text', value: matches.join('\n\n') }
      },
    },
  }
}

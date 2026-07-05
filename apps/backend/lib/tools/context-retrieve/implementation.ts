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
import { canSendAsNativeFile, canSendAsNativeImage } from '@/backend/lib/chat/file-attachment-policy'
import { renderMessagePlainText } from '@/backend/lib/chat/message-projection'
import type * as dto from '@/types/dto'

const isTextLikeMimeType = (mimeType: string) =>
  mimeType.startsWith('text/') || mimeType === 'application/json'

const MAX_SEARCH_RESULTS = 20
const SNIPPET_RADIUS_CHARS = 80

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
  ) {
  }

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
        "Search this conversation's original, uncompressed message history for a text query (case-insensitive). Returns matching message ids with a short snippet — use the id with get_message to read the full original content.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'text to search for',
          },
        },
        additionalProperties: false,
        required: ['query'],
      },
      invoke: async ({ messages, params }: ToolInvokeParams) => {
        const query = `${params.query}`.trim()
        if (!query) {
          return { type: 'error-text', value: 'Empty search query' }
        }
        const needle = query.toLowerCase()
        const matches: string[] = []
        for (const message of messages) {
          const text = renderMessagePlainText(message)
          const index = text.toLowerCase().indexOf(needle)
          if (index === -1) continue
          const start = Math.max(0, index - SNIPPET_RADIUS_CHARS)
          const end = Math.min(text.length, index + needle.length + SNIPPET_RADIUS_CHARS)
          const snippet = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
          matches.push(`id: ${message.id} (role: ${message.role})\n${snippet}`)
          if (matches.length >= MAX_SEARCH_RESULTS) break
        }
        if (matches.length === 0) {
          return { type: 'text', value: `No messages matched "${query}".` }
        }
        return { type: 'text', value: matches.join('\n\n') }
      },
    },
  }
}

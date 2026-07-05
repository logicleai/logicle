import {
  ToolImplementation,
  ToolParams,
  ToolFunctions,
  ToolFunctionContext,
} from '@/lib/chat/tools'
import { db } from '@/db/database'
import { LlmModel } from '@/lib/chat/models'
import { cachingExtractor } from '@/lib/textextraction/cache'
import type { FileDbRow } from '@/backend/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { canSendAsNativeFile, canSendAsNativeImage } from '@/backend/lib/chat/file-attachment-policy'

const isTextLikeMimeType = (mimeType: string) =>
  mimeType.startsWith('text/') || mimeType === 'application/json'

export class RetrieveFilePlugin implements ToolImplementation {
  static toolName = 'retrieve-file'
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

  functions_: ToolFunctions = {
    read_file: {
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
  }
}

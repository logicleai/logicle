import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import {
  TranslateDeeplInterface,
  TranslateDeeplParams,
  TranslateDeeplSchema,
} from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import { expandToolParameter } from '@/backend/lib/tools/configSecrets'
import { getFileWithId } from '@/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { storage } from '@/lib/storage'
import { logger } from '@/lib/logging'
import { saveFile } from '@/backend/lib/tools/file-output-normalization'

type DeeplDocumentUploadResponse = {
  document_id: string
  document_key: string
}

type DeeplDocumentStatusResponse = {
  document_id: string
  status: 'queued' | 'translating' | 'done' | 'error'
  seconds_remaining?: number
  billed_characters?: number
  error_message?: string
}

type DeeplTextTranslationResponse = {
  translations: {
    detected_source_language: string
    text: string
  }[]
}

const DEFAULT_API_URL = 'https://api.deepl.com'

// Document formats accepted by the DeepL document endpoint. Declaring them here
// is what allows users to attach these files in a chat where the tool is enabled.
const supportedDocumentMedia = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'text/html',
  'text/plain',
  'application/xliff+xml',
  'application/x-subrip',
]

const sleep = async (ms: number) => await new Promise((resolve) => setTimeout(resolve, ms))

// DeepL target languages may carry a region (EN-GB, PT-BR); source languages may not.
export const normalizeTargetLang = (lang: string) => lang.trim().toUpperCase()
export const normalizeSourceLang = (lang: string) => lang.trim().toUpperCase().split('-')[0]

export const translatedFileName = (fileName: string, targetLang: string) => {
  const dotIndex = fileName.lastIndexOf('.')
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : ''
  return `${base}_${targetLang}${extension}`
}

export class TranslateDeepl extends TranslateDeeplInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new TranslateDeepl(toolParams, TranslateDeeplSchema.parse(params))

  supportedMedia = supportedDocumentMedia

  constructor(
    public toolParams: ToolParams,
    private params: TranslateDeeplParams
  ) {
    super()
  }

  functions = async (_model: LlmModel, _context: ToolFunctionContext) => this.functions_

  private functions_: ToolFunctions = {
    translate_document: {
      description:
        'Translate an uploaded document (docx, pptx, xlsx, pdf, html, txt, xliff, srt) by file ID, preserving its formatting. Returns the translated document as a file.',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'ID of the uploaded file to translate.',
            minLength: 1,
          },
          targetLang: {
            type: 'string',
            description:
              'Target language code, for example IT, DE, FR, EN-GB, EN-US, PT-BR. Ask the user if it is not clear from the conversation.',
          },
          sourceLang: {
            type: 'string',
            description:
              'Source language code, for example IT, DE, EN. Omit it to let DeepL detect the language.',
          },
        },
        required: ['fileId', 'targetLang'],
        additionalProperties: false,
      },
      requireConfirm: false,
      invoke: this.invokeTranslateDocument.bind(this),
    },
    translate_text: {
      description:
        'Translate a short text with DeepL. Use translate_document for uploaded files, never this function.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to translate.',
            minLength: 1,
          },
          targetLang: {
            type: 'string',
            description:
              'Target language code, for example IT, DE, FR, EN-GB, EN-US, PT-BR. Ask the user if it is not clear from the conversation.',
          },
          sourceLang: {
            type: 'string',
            description:
              'Source language code, for example IT, DE, EN. Omit it to let DeepL detect the language.',
          },
        },
        required: ['text', 'targetLang'],
        additionalProperties: false,
      },
      requireConfirm: false,
      invoke: this.invokeTranslateText.bind(this),
    },
  }

  private getApiUrl() {
    return this.params.apiUrl ?? DEFAULT_API_URL
  }

  private async getAuthHeaders() {
    const apiKey = await expandToolParameter(this.toolParams, this.params.apiKey)
    return {
      authorization: `DeepL-Auth-Key ${apiKey}`,
    }
  }

  private resolveTargetLang(params: Record<string, unknown>) {
    const requested = `${params.targetLang ?? ''}`.trim() || this.params.defaultTargetLang || ''
    return requested ? normalizeTargetLang(requested) : ''
  }

  private async invokeTranslateDocument({
    params,
    userId,
    conversationId,
    assistantId,
    rootOwner,
  }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const fileId = `${params.fileId ?? ''}`.trim()
    if (!fileId) {
      return { type: 'error-text', value: 'fileId is required' }
    }

    const targetLang = this.resolveTargetLang(params)
    if (!targetLang) {
      return { type: 'error-text', value: 'targetLang is required' }
    }

    if (!(await canAccessFile({ userId }, fileId))) {
      return { type: 'error-text', value: `You are not authorized to access file: ${fileId}` }
    }

    const fileEntry = await getFileWithId(fileId)
    if (!fileEntry) {
      return { type: 'error-text', value: `File not found: ${fileId}` }
    }

    try {
      const headers = await this.getAuthHeaders()
      const fileContent = await storage.readBuffer(fileEntry.path, fileEntry.encryption)

      const form = new FormData()
      form.append('target_lang', targetLang)
      if (params.sourceLang) {
        form.append('source_lang', normalizeSourceLang(`${params.sourceLang}`))
      }
      if (this.params.formality) {
        form.append('formality', this.params.formality)
      }
      if (this.params.glossaryId) {
        form.append('glossary_id', this.params.glossaryId)
      }
      form.append(
        'file',
        new Blob([new Uint8Array(fileContent)], {
          type: fileEntry.type || 'application/octet-stream',
        }),
        fileEntry.name
      )

      const uploadResponse = await fetch(`${this.getApiUrl()}/v2/document`, {
        method: 'POST',
        headers,
        body: form,
      })
      if (!uploadResponse.ok) {
        return {
          type: 'error-text',
          value: `DeepL document upload failed: ${
            uploadResponse.status
          } ${await uploadResponse.text()}`,
        }
      }
      const upload = (await uploadResponse.json()) as DeeplDocumentUploadResponse

      const status = await this.pollDocument(upload, headers)
      if (status.status === 'error') {
        return {
          type: 'error-text',
          value: `DeepL translation failed: ${status.error_message ?? 'unknown error'}`,
        }
      }

      const resultResponse = await fetch(
        `${this.getApiUrl()}/v2/document/${upload.document_id}/result`,
        {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ document_key: upload.document_key }),
        }
      )
      if (!resultResponse.ok) {
        return {
          type: 'error-text',
          value: `DeepL document download failed: ${
            resultResponse.status
          } ${await resultResponse.text()}`,
        }
      }

      const translatedContent = Buffer.from(await resultResponse.arrayBuffer())
      const fileName = translatedFileName(fileEntry.name, targetLang)
      logger.info('DeepL document translated', {
        toolId: this.toolParams.id,
        targetLang,
        billedCharacters: status.billed_characters ?? null,
        size: translatedContent.byteLength,
      })

      const persisted = await saveFile({
        rootOwner,
        conversationId,
        userId,
        assistantId,
        content: translatedContent,
        mimeType:
          resultResponse.headers.get('content-type') ??
          fileEntry.type ??
          'application/octet-stream',
        nameHint: fileName,
        source: 'DeepL',
      })

      return {
        type: 'content',
        value: [
          {
            type: 'text',
            text: `The document has been translated to ${targetLang} and attached as ${fileName}. Do not provide a download link, it is already available in the UI.`,
          },
          persisted,
        ],
      }
    } catch (error) {
      return {
        type: 'error-text',
        value: error instanceof Error ? error.message : 'Document translation failed',
      }
    }
  }

  private async invokeTranslateText({
    params,
  }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const text = `${params.text ?? ''}`
    if (!text.trim()) {
      return { type: 'error-text', value: 'text is required' }
    }

    const targetLang = this.resolveTargetLang(params)
    if (!targetLang) {
      return { type: 'error-text', value: 'targetLang is required' }
    }

    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.getApiUrl()}/v2/translate`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          text: [text],
          target_lang: targetLang,
          ...(params.sourceLang
            ? { source_lang: normalizeSourceLang(`${params.sourceLang}`) }
            : {}),
          ...(this.params.formality ? { formality: this.params.formality } : {}),
          ...(this.params.glossaryId ? { glossary_id: this.params.glossaryId } : {}),
        }),
      })
      if (!response.ok) {
        return {
          type: 'error-text',
          value: `DeepL text translation failed: ${response.status} ${await response.text()}`,
        }
      }

      const body = (await response.json()) as DeeplTextTranslationResponse
      const translation = body.translations?.[0]
      if (!translation) {
        return { type: 'error-text', value: 'DeepL returned no translation' }
      }
      return {
        type: 'json',
        value: {
          translatedText: translation.text,
          detectedSourceLanguage: translation.detected_source_language,
          targetLanguage: targetLang,
        },
      }
    } catch (error) {
      return {
        type: 'error-text',
        value: error instanceof Error ? error.message : 'Text translation failed',
      }
    }
  }

  private async pollDocument(
    upload: DeeplDocumentUploadResponse,
    headers: Record<string, string>
  ): Promise<DeeplDocumentStatusResponse> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < this.params.timeoutMs) {
      const response = await fetch(`${this.getApiUrl()}/v2/document/${upload.document_id}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ document_key: upload.document_key }),
      })
      if (!response.ok) {
        throw new Error(
          `DeepL document status check failed: ${response.status} ${await response.text()}`
        )
      }

      const body = (await response.json()) as DeeplDocumentStatusResponse
      if (body.status === 'done' || body.status === 'error') {
        return body
      }
      await sleep(this.params.pollIntervalMs)
    }

    throw new Error(`Document translation timed out after ${this.params.timeoutMs} ms`)
  }
}

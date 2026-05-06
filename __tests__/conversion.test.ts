import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { LlmModelCapabilities } from '@/lib/chat/models'
import type * as dto from '@/types/dto'

const ensureFileAnalysis = vi.fn()
const readBuffer = vi.fn()
const extractFromFile = vi.fn()
const getFileWithId = vi.fn()
const warn = vi.fn()
const info = vi.fn()

vi.mock('@/models/file', () => ({
  getFileWithId,
}))

vi.mock('@/lib/file-analysis', () => ({
  ensureFileAnalysis,
  isReadyFileAnalysis: (analysis: dto.FileAnalysis | undefined) =>
    analysis?.status === 'ready' && analysis.payload !== null,
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    readBuffer,
  },
}))

vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: {
    extractFromFile,
  },
}))

vi.mock('@/lib/logging', () => ({
  logger: {
    info,
    warn,
  },
}))

const pdfCapabilities: LlmModelCapabilities = {
  vision: false,
  function_calling: true,
  reasoning: false,
  supportedMedia: ['application/pdf'],
  nativePdfPageLimit: 100,
}

const openaiLanguageModel = { provider: 'openai.responses' } as any
const litellmLanguageModel = { provider: 'litellm.chat' } as any

const pdfFile = {
  fileBlobId: 'blob-1',
  id: 'pdf-1',
  name: 'example.pdf',
  ownerType: 'USER' as const,
  ownerId: 'u1',
  path: 'files/example.pdf',
  type: 'application/pdf',
  size: 123,
  createdAt: new Date().toISOString(),
  encrypted: 0 as const,
}

describe('dtoFileToLlmFilePart', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('returns courtesy text for native PDFs over the page limit', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfFile.size,
        pageCount: 101,
        visionPageCount: 0,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 101,
        contentMode: 'scanned',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)

    const { dtoFileToLlmFilePart } = await import('@/backend/lib/chat/conversion')
    const part = await dtoFileToLlmFilePart(pdfFile, pdfCapabilities)

    expect(part).toEqual({
      type: 'text',
      text: `The file "${pdfFile.name}" with id ${pdfFile.id} could not be sent as an attachment: it has too many pages (101 pages, limit is 100). It is possible that some tools can return the content on demand`,
    })
    expect(readBuffer).not.toHaveBeenCalled()
    expect(extractFromFile).not.toHaveBeenCalled()
  })

  test('falls back to text when PDF analysis failed', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'failed',
      analyzerVersion: 1,
      payload: null,
      error: 'boom',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    extractFromFile.mockResolvedValue('fallback text')

    const { dtoFileToLlmFilePart } = await import('@/backend/lib/chat/conversion')
    const part = await dtoFileToLlmFilePart(pdfFile, pdfCapabilities)

    expect(part).toEqual({
      type: 'text',
      text: `Here is the text content of the file "${pdfFile.name}" with id ${pdfFile.id}\nfallback text`,
    })
    expect(extractFromFile).toHaveBeenCalledWith(pdfFile)
    expect(readBuffer).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  test('returns native file part for PDFs within the page limit', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfFile.size,
        pageCount: 10,
        visionPageCount: 0,
        textCharCount: 50,
        hasExtractableText: true,
        imagePageCount: 0,
        contentMode: 'text',
        extractedTextPath: 'files/example.pdf.analysis-v1.txt',
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readBuffer.mockResolvedValue(Buffer.from('pdf-bytes'))

    const { dtoFileToLlmFilePart } = await import('@/backend/lib/chat/conversion')
    const part = await dtoFileToLlmFilePart(pdfFile, pdfCapabilities)

    expect(part).toEqual({
      type: 'file',
      filename: pdfFile.name,
      data: Buffer.from('pdf-bytes').toString('base64'),
      mediaType: pdfFile.type,
    })
    expect(readBuffer).toHaveBeenCalledWith(pdfFile.path, false)
  })
})

describe('dtoMessageToLlmMessage tool file conversion', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getFileWithId.mockResolvedValue(pdfFile)
  })

  test('eagerly injects tool-result PDF files by default', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfFile.size,
        pageCount: 10,
        visionPageCount: 0,
        textCharCount: 50,
        hasExtractableText: true,
        imagePageCount: 0,
        contentMode: 'text',
        extractedTextPath: 'files/example.pdf.analysis-v1.txt',
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)

    readBuffer.mockResolvedValue(Buffer.from('pdf-bytes'))
    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const message = await dtoMessageToLlmMessage(
      {
        id: 'm1',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'fetch',
            result: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  id: pdfFile.id,
                  name: pdfFile.name,
                  size: pdfFile.size,
                  mimetype: pdfFile.type,
                },
              ],
            },
          },
        ],
      },
      pdfCapabilities,
      openaiLanguageModel.provider
    )

    expect(message).toEqual({
      role: 'tool',
      content: [
        {
          toolCallId: 'call1',
          toolName: 'fetch',
          type: 'tool-result',
          output: {
            type: 'content',
            value: [
              {
                type: 'text',
                text: JSON.stringify({
                  attached_files: [
                    {
                      id: pdfFile.id,
                      name: pdfFile.name,
                      size: pdfFile.size,
                      mimetype: pdfFile.type,
                    },
                  ],
                }),
              },
              { type: 'file-data', data: Buffer.from('pdf-bytes').toString('base64'), mediaType: pdfFile.type },
            ],
          },
        },
      ],
    })
    expect(getFileWithId).toHaveBeenCalledWith(pdfFile.id)
    expect(readBuffer).toHaveBeenCalledWith(pdfFile.path, false)
  })

  test('eagerly injects tool-result PDFs', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfFile.size,
        pageCount: 10,
        visionPageCount: 0,
        textCharCount: 50,
        hasExtractableText: true,
        imagePageCount: 0,
        contentMode: 'text',
        extractedTextPath: 'files/example.pdf.analysis-v1.txt',
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readBuffer.mockResolvedValue(Buffer.from('pdf-bytes'))

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const message = await dtoMessageToLlmMessage(
      {
        id: 'm2',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'fetch',
            result: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  id: pdfFile.id,
                  name: pdfFile.name,
                  size: pdfFile.size,
                  mimetype: pdfFile.type,
                },
              ],
            },
          },
        ],
      },
      pdfCapabilities,
      openaiLanguageModel.provider
    )

    expect(message).toEqual({
      role: 'tool',
      content: [
        {
          toolCallId: 'call1',
          toolName: 'fetch',
          type: 'tool-result',
          output: {
            type: 'content',
            value: [
              {
                type: 'text',
                text: JSON.stringify({
                  attached_files: [
                    {
                      id: pdfFile.id,
                      name: pdfFile.name,
                      size: pdfFile.size,
                      mimetype: pdfFile.type,
                    },
                  ],
                }),
              },
              {
                type: 'file-data',
                data: Buffer.from('pdf-bytes').toString('base64'),
                mediaType: pdfFile.type,
              },
            ],
          },
        },
      ],
    })
    expect(getFileWithId).toHaveBeenCalledWith(pdfFile.id)
    expect(readBuffer).toHaveBeenCalledWith(pdfFile.path, false)
  })

  test('keeps tool-result file attachments as descriptor-only for litellm even when eager injection is on', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfFile.size,
        pageCount: 10,
        visionPageCount: 0,
        textCharCount: 50,
        hasExtractableText: true,
        imagePageCount: 0,
        contentMode: 'text',
        extractedTextPath: 'files/example.pdf.analysis-v1.txt',
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const message = await dtoMessageToLlmMessage(
      {
        id: 'm3',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'fetch',
            result: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  id: pdfFile.id,
                  name: pdfFile.name,
                  size: pdfFile.size,
                  mimetype: pdfFile.type,
                },
              ],
            },
          },
        ],
      },
      pdfCapabilities,
      litellmLanguageModel.provider
    )

    expect(message).toEqual({
      role: 'tool',
      content: [
        {
          toolCallId: 'call1',
          toolName: 'fetch',
          type: 'tool-result',
          output: {
            type: 'content',
            value: [
              {
                type: 'text',
                text: JSON.stringify({
                  attached_files: [
                    {
                      id: pdfFile.id,
                      name: pdfFile.name,
                      size: pdfFile.size,
                      mimetype: pdfFile.type,
                    },
                  ],
                }),
              },
              {
                type: 'text',
                text: `The tool returned a file attachment "${pdfFile.name}" (${pdfFile.type}, id ${pdfFile.id}) that is available in the UI, but this provider cannot receive binary tool attachments.`,
              },
            ],
          },
        },
      ],
    })
    expect(getFileWithId).toHaveBeenCalledWith(pdfFile.id)
    expect(readBuffer).not.toHaveBeenCalled()
    expect(ensureFileAnalysis).not.toHaveBeenCalled()
  })

  test('eagerly extracts text when the model has no native PDF support', async () => {
    extractFromFile.mockResolvedValue('fallback pdf text')

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const message = await dtoMessageToLlmMessage(
      {
        id: 'm3b',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'fetch',
            result: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  id: pdfFile.id,
                  name: pdfFile.name,
                  size: pdfFile.size,
                  mimetype: pdfFile.type,
                },
              ],
            },
          },
        ],
      },
      { vision: false, function_calling: true, reasoning: false, supportedMedia: [] },
      openaiLanguageModel.provider
    )

    expect(message).toEqual({
      role: 'tool',
      content: [
        {
          toolCallId: 'call1',
          toolName: 'fetch',
          type: 'tool-result',
          output: {
            type: 'content',
            value: [
              {
                type: 'text',
                text: JSON.stringify({
                  attached_files: [
                    {
                      id: pdfFile.id,
                      name: pdfFile.name,
                      size: pdfFile.size,
                      mimetype: pdfFile.type,
                    },
                  ],
                }),
              },
              {
                type: 'text',
                text: `Here is the text content of the file "${pdfFile.name}" with id ${pdfFile.id}\nfallback pdf text`,
              },
            ],
          },
        },
      ],
    })
    expect(extractFromFile).toHaveBeenCalledWith(pdfFile)
    expect(getFileWithId).toHaveBeenCalledWith(pdfFile.id)
    expect(readBuffer).not.toHaveBeenCalled()
    expect(ensureFileAnalysis).not.toHaveBeenCalled()
  })

  test('keeps tool-result image attachments as descriptor-only for litellm even when eager injection is on', async () => {
    const imageFile = {
      ...pdfFile,
      id: 'img-1',
      name: 'generated.png',
      path: 'files/generated.png',
      type: 'image/png',
    }
    getFileWithId.mockResolvedValue(imageFile)

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const message = await dtoMessageToLlmMessage(
      {
        id: 'm4',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call1',
            toolName: 'generate_image',
            result: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  id: imageFile.id,
                  name: imageFile.name,
                  size: imageFile.size,
                  mimetype: imageFile.type,
                },
              ],
            },
          },
        ],
      },
      { ...pdfCapabilities, vision: true, supportedMedia: ['image/png'] },
      litellmLanguageModel.provider
    )

    expect(message).toEqual({
      role: 'tool',
      content: [
        {
          toolCallId: 'call1',
          toolName: 'generate_image',
          type: 'tool-result',
          output: {
            type: 'content',
            value: [
              {
                type: 'text',
                text: JSON.stringify({
                  attached_files: [
                    {
                      id: imageFile.id,
                      name: imageFile.name,
                      size: imageFile.size,
                      mimetype: imageFile.type,
                    },
                  ],
                }),
              },
              {
                type: 'text',
                text: `The tool returned a file attachment "${imageFile.name}" (${imageFile.type}, id ${imageFile.id}) that is available in the UI, but this provider cannot receive binary tool attachments.`,
              },
            ],
          },
        },
      ],
    })
    expect(getFileWithId).toHaveBeenCalledWith(imageFile.id)
    expect(readBuffer).not.toHaveBeenCalled()
    expect(ensureFileAnalysis).not.toHaveBeenCalled()
  })
})

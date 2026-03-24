import { beforeEach, describe, expect, test, vi } from 'vitest'
import type * as dto from '@/types/dto'
import { claude35SonnetModel, claude3HaikuModel, claude46SonnetModel } from '@/lib/chat/models/anthropic'
import { gpt35Model, gpt41Model, gpt41MiniModel } from '@/lib/chat/models/openai'
import { countTextForModel, countTextWithTokenizer } from '@/lib/chat/tokenizer'
import { normalizeExtractedText } from '@/backend/lib/chat/pdf-token-estimator'
import { estimateNativeImageTokensFromDimensions } from '@/backend/lib/chat/image-token-estimator'

// Regression helpers — intentionally NOT delegating to the implementation so that bugs in
// resolvePdfEstimatorModel() or predictPdfTokenCount() are caught by the tests.
// Coefficients must stay in sync with pdfEstimatorModels in pdf-token-estimator.ts.
const openAiPdfTokens = (visionPages: number, totalPages: number, textTokens: number) =>
  Math.ceil(
    9.357196401421788 +
      1250.4471582825092 * visionPages +
      13.766225362254438 * totalPages +
      1.1342632221667341 * textTokens
  )
const anthropicPdfTokens = (visionPages: number, totalPages: number, textTokens: number) =>
  Math.ceil(
    26.53813009584519 +
      1.65001802114557 * visionPages +
      1572.8790151597427 * totalPages +
      1.0741231860618194 * textTokens
  )

const getFileWithId = vi.fn()
const ensureFileAnalysis = vi.fn()
const readExtractedTextFromAnalysis = vi.fn()
const readBuffer = vi.fn()
const extractFromFile = vi.fn()

vi.mock('@/models/file', () => ({
  getFileWithId,
}))

vi.mock('@/lib/file-analysis', () => ({
  ensureFileAnalysis,
  isReadyFileAnalysis: (analysis: dto.FileAnalysis | undefined) =>
    analysis?.status === 'ready' && analysis.payload !== null,
  readExtractedTextFromAnalysis,
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

const assistantParams = {
  model: claude35SonnetModel.id,
  assistantId: 'assistant-1',
  systemPrompt: '',
  temperature: 0,
  tokenLimit: 200000,
  reasoning_effort: null,
} as const

const mockBuildPreambleSegments = async (segments: any[]) => {
  const preambleModule = await import('@/backend/lib/chat/preamble')
  vi.spyOn(preambleModule, 'buildPreambleSegments').mockResolvedValue(segments as never)
}

const makePdfFile = (id: string) => ({
  id,
  name: `${id}.pdf`,
  path: `files/${id}.pdf`,
  type: 'application/pdf',
  size: 123,
  uploaded: 1 as const,
  createdAt: new Date().toISOString(),
  encrypted: 0 as const,
})

const makeImageFile = (id: string) => ({
  id,
  name: `${id}.png`,
  path: `files/${id}.png`,
  type: 'image/png',
  size: 456,
  uploaded: 1 as const,
  createdAt: new Date().toISOString(),
  encrypted: 0 as const,
})

describe('estimateInputTokens', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.TOKEN_ESTIMATOR_FILE_CACHE_MAX_ENTRIES

    const { setTokenizerCounter } = await import('@/backend/lib/chat/prompt-token-counter')
    setTokenizerCounter({
      countText: async (tokenizer, text) => countTextWithTokenizer(tokenizer, text),
    })
  })

  test('counts knowledge PDFs through analysis without loading file bytes', async () => {
    const fileId = 'knowledge-pdf'
    const fileEntry = makePdfFile(fileId)
    const analysis: dto.FileAnalysis = {
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: fileEntry.size,
        pageCount: 2,
        visionPageCount: 1,
        textCharCount: 11,
        hasExtractableText: true,
        imagePageCount: 1,
        contentMode: 'mixed',
        extractedTextPath: `${fileEntry.path}.analysis-v1.txt`,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    getFileWithId.mockResolvedValue(fileEntry)
    ensureFileAnalysis.mockResolvedValue(analysis)
    readExtractedTextFromAnalysis.mockResolvedValue('hello world')
    await mockBuildPreambleSegments([
      {
        scope: 'prompt',
        message: { role: 'system', content: 'system' },
        analysisFileIds: [fileId],
      },
    ])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [{ id: fileId, name: fileEntry.name, type: fileEntry.type, size: fileEntry.size }],
      history: [],
      draftText: '',
      attachmentFileIds: [],
    })

    const expectedPdfTokens = anthropicPdfTokens(
      1,
      2,
      countTextForModel(claude35SonnetModel, normalizeExtractedText('hello world'))
    )
    const expectedAssistantTokens =
      countTextForModel(claude35SonnetModel, 'system') + expectedPdfTokens

    expect(result.estimate.assistant).toBe(expectedAssistantTokens)
    expect(result.estimate.total).toBe(expectedAssistantTokens)
    expect(readExtractedTextFromAnalysis).toHaveBeenCalledWith(
      fileEntry,
      expect.objectContaining({ fileId })
    )
    expect(readBuffer).not.toHaveBeenCalled()
  })

  test('treats missing extracted text as empty text for analyzed PDFs', async () => {
    const fileId = 'knowledge-pdf-no-text'
    const fileEntry = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(fileEntry)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: fileEntry.size,
        pageCount: 2,
        visionPageCount: 1,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 1,
        contentMode: 'mixed',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readExtractedTextFromAnalysis.mockResolvedValue(null)
    await mockBuildPreambleSegments([
      {
        scope: 'prompt',
        message: { role: 'system', content: 'system' },
        analysisFileIds: [fileId],
      },
    ])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.assistant).toBe(
      countTextForModel(claude35SonnetModel, 'system') + anthropicPdfTokens(1, 2, 0)
    )
  })

  test('falls back to the default file cache size when the env var is falsy', async () => {
    process.env.TOKEN_ESTIMATOR_FILE_CACHE_MAX_ENTRIES = '0'
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.total).toBe(0)
  })

  test('returns zero token cost for PDF attachments when analysis failed', async () => {
    const fileId = 'failed-pdf'
    getFileWithId.mockResolvedValue(makePdfFile(fileId))
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'failed',
      analyzerVersion: 1,
      payload: null,
      error: 'boom',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.estimate).toEqual({
      assistant: 0,
      history: 0,
      draft: 0,
      total: 0,
    })
    expect(readExtractedTextFromAnalysis).not.toHaveBeenCalled()
    expect(readBuffer).not.toHaveBeenCalled()
  })

  test('counts image attachments from analysis metadata without reading file bytes', async () => {
    const fileId = 'image-1'
    getFileWithId.mockResolvedValue(makeImageFile(fileId))
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'image',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'image',
        mimeType: 'image/png',
        sizeBytes: 456,
        width: 1024,
        height: 1024,
        frameCount: 1,
        hasAlpha: false,
        format: 'png',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt41MiniModel.id },
      model: gpt41MiniModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    const expectedImageTokens = Math.ceil(
      estimateNativeImageTokensFromDimensions(gpt41MiniModel, 1024, 1024)
    )

    expect(result.estimate).toEqual({
      assistant: 0,
      history: 0,
      draft: expectedImageTokens,
      total: expectedImageTokens,
    })
    expect(readExtractedTextFromAnalysis).not.toHaveBeenCalled()
    expect(readBuffer).not.toHaveBeenCalled()
  })

  test('counts courtesy text for draft PDF attachments over the native page limit', async () => {
    const fileId = 'pdf-over-limit'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 101,
        visionPageCount: 0,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 0,
        contentMode: 'scanned',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    const { getPdfAttachmentPageLimitText } = await import('@/backend/lib/chat/file-attachment-policy')
    const courtesyText = getPdfAttachmentPageLimitText(file, 101, claude35SonnetModel)!
    expect(result.estimate.draft).toBe(countTextForModel(claude35SonnetModel, courtesyText))
    expect(readExtractedTextFromAnalysis).not.toHaveBeenCalled()
  })

  test('counts under-limit PDF attachments through analyzed native token estimation', async () => {
    const fileId = 'pdf-under-limit'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 2,
        visionPageCount: 1,
        textCharCount: 11,
        hasExtractableText: true,
        imagePageCount: 1,
        contentMode: 'mixed',
        extractedTextPath: `${file.path}.analysis-v1.txt`,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readExtractedTextFromAnalysis.mockResolvedValue('hello world')
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.estimate.draft).toBe(
      anthropicPdfTokens(
        1,
        2,
        countTextForModel(claude35SonnetModel, normalizeExtractedText('hello world'))
      )
    )
  })

  test('counts OpenAI PDF attachments even when there is no native page limit', async () => {
    const fileId = 'openai-pdf'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 100,
        visionPageCount: 100,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 100,
        contentMode: 'scanned',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readExtractedTextFromAnalysis.mockResolvedValue(null)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt41MiniModel.id },
      model: gpt41MiniModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    const expectedPdfTokens = openAiPdfTokens(100, 100, 0)
    expect(result.estimate).toEqual({
      assistant: 0,
      history: 0,
      draft: expectedPdfTokens,
      total: expectedPdfTokens,
    })
  })

  test('returns zero when over-limit PDF courtesy text is unavailable', async () => {
    vi.doMock('@/backend/lib/chat/file-attachment-policy', async () => {
      const actual = await vi.importActual<typeof import('@/backend/lib/chat/file-attachment-policy')>(
        '@/backend/lib/chat/file-attachment-policy'
      )
      return {
        ...actual,
        getPdfAttachmentPageLimitText: () => null,
      }
    })

    const fileId = 'pdf-over-limit-no-text'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 101,
        visionPageCount: 0,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 0,
        contentMode: 'scanned',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.estimate.draft).toBe(0)
    vi.doUnmock('@/backend/lib/chat/file-attachment-policy')
  })

  test('returns zero for analyzed files that are missing, incomplete, or unsupported', async () => {
    const fileIds = ['missing-file', 'failed-analysis', 'word-analysis']
    getFileWithId.mockImplementation(async (fileId: string) => {
      if (fileId === 'missing-file') {
        return undefined
      }
      if (fileId === 'word-analysis') {
        return {
          id: fileId,
          name: 'doc.docx',
          path: `files/${fileId}.docx`,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 20,
          uploaded: 1 as const,
          createdAt: new Date().toISOString(),
          encrypted: 0 as const,
        }
      }
      return makePdfFile(fileId)
    })
    ensureFileAnalysis.mockImplementation(async (fileIdOrFile: { id: string }) => {
      if (fileIdOrFile.id === 'failed-analysis') {
        return {
          fileId: 'failed-analysis',
          kind: 'pdf',
          status: 'failed',
          analyzerVersion: 1,
          payload: null,
          error: 'nope',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies dto.FileAnalysis
      }
      return {
        fileId: 'word-analysis',
        kind: 'word',
        status: 'ready',
        analyzerVersion: 1,
        payload: {
          kind: 'word',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sizeBytes: 20,
          textCharCount: 10,
          hasExtractableText: true,
          extractedTextPath: null,
        },
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies dto.FileAnalysis
    })
    await mockBuildPreambleSegments([
      {
        scope: 'prompt',
        message: { role: 'system', content: 'system' },
        analysisFileIds: fileIds,
      },
    ])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.assistant).toBe(countTextForModel(claude35SonnetModel, 'system'))
    expect(readExtractedTextFromAnalysis).not.toHaveBeenCalled()
  })

  test('returns zero for PDF history attachments when the file row or payload is unusable', async () => {
    const badTypeId = 'pdf-bad-type'
    const badPayloadId = 'pdf-bad-payload'
    getFileWithId.mockImplementation(async (fileId: string) => {
      if (fileId === badTypeId) {
        return { ...makePdfFile(fileId), type: 'text/plain' }
      }
      return makePdfFile(fileId)
    })
    ensureFileAnalysis.mockImplementation(async (fileIdOrFile: { id: string }) => ({
      fileId: fileIdOrFile.id,
      kind: fileIdOrFile.id === badPayloadId ? 'word' : 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload:
        fileIdOrFile.id === badPayloadId
          ? {
              kind: 'word',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              sizeBytes: 12,
              textCharCount: 8,
              hasExtractableText: true,
              extractedTextPath: null,
            }
          : {
              kind: 'pdf',
              mimeType: 'application/pdf',
              sizeBytes: 123,
              pageCount: 1,
              visionPageCount: 0,
              textCharCount: 0,
              hasExtractableText: false,
              imagePageCount: 0,
              contentMode: 'text',
              extractedTextPath: null,
            },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [
        {
          id: 'user-1',
          conversationId: 'c1',
          parent: null,
          sentAt: new Date().toISOString(),
          citations: [],
          role: 'user',
          content: '',
          attachments: [
            { id: badTypeId, name: 'bad-type.pdf', mimetype: 'application/pdf', size: 123 },
            { id: badPayloadId, name: 'bad-payload.pdf', mimetype: 'application/pdf', size: 123 },
          ],
        },
      ],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.history).toBe(0)
  })

  test('counts extracted-text fallback for PDF attachments when the model does not support native PDFs', async () => {
    const file = makePdfFile('plain-pdf')
    getFileWithId.mockResolvedValue(file)
    extractFromFile.mockResolvedValue('plain pdf text')
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt35Model.id },
      model: gpt35Model,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [
        {
          id: 'user-2',
          conversationId: 'c1',
          parent: null,
          sentAt: new Date().toISOString(),
          citations: [],
          role: 'user',
          content: '',
          attachments: [{ id: 'plain-pdf', name: 'plain.pdf', mimetype: 'application/pdf', size: 10 }],
        },
      ],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.history).toBe(
      countTextForModel(
        gpt35Model,
        `Here is the text content of the file "${file.name}" with id ${file.id}\nplain pdf text`
      )
    )
    expect(getFileWithId).toHaveBeenCalledWith(file.id)
    expect(extractFromFile).toHaveBeenCalledWith(file)
  })

  test('counts metadata for attachments without native analysis-backed handling', async () => {
    const fileId = 'text-attachment'
    const file = {
      id: fileId,
      name: 'notes.txt',
      path: 'files/notes.txt',
      type: 'text/plain',
      size: 20,
      uploaded: 1 as const,
      createdAt: new Date().toISOString(),
      encrypted: 0 as const,
    }
    getFileWithId.mockResolvedValue(file)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.estimate.draft).toBe(
      countTextForModel(
        claude35SonnetModel,
        JSON.stringify({ filename: file.name, mediaType: file.type })
      )
    )
  })

  test('counts assistant and tool history message parts', async () => {
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [
        {
          id: 'assistant-1',
          conversationId: 'c1',
          parent: null,
          sentAt: new Date().toISOString(),
          citations: [],
          role: 'assistant',
          parts: [
            { type: 'text', text: 'hello' },
            { type: 'reasoning', reasoning: 'thinking' },
            { type: 'tool-call', toolCallId: 'call1', toolName: 'search', args: { q: 'cats' } },
          ],
        },
        {
          id: 'tool-1',
          conversationId: 'c1',
          parent: null,
          sentAt: new Date().toISOString(),
          citations: [],
          role: 'tool',
          parts: [
            { type: 'step-start' } as any,
            {
              type: 'tool-result',
              toolCallId: 'call1',
              toolName: 'search',
              result: { type: 'text', value: 'done' },
            },
          ],
        },
      ],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.history).toBeGreaterThan(0)
  })

  test('ignores unknown message roles in history token estimation', async () => {
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [
        {
          id: 'weird-1',
          conversationId: 'c1',
          parent: null,
          sentAt: new Date().toISOString(),
          citations: [],
          role: 'user-request',
          content: {} as any,
        } as unknown as dto.Message,
      ],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.history).toBe(0)
  })

  test('reuses the analyzed file token cache on repeated calls', async () => {
    const fileId = 'cached-image'
    getFileWithId.mockResolvedValue(makeImageFile(fileId))
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'image',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'image',
        mimeType: 'image/png',
        sizeBytes: 456,
        width: 512,
        height: 512,
        frameCount: 1,
        hasAlpha: false,
        format: 'png',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt41MiniModel.id },
      model: gpt41MiniModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt41MiniModel.id },
      model: gpt41MiniModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.cache.fileTokenCache.hits).toBeGreaterThan(0)
  })

  test('skips text extraction for PDFs without extracted text and ignores over-limit knowledge PDFs', async () => {
    const fileId = 'knowledge-over-limit'
    const fileEntry = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(fileEntry)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: fileEntry.size,
        pageCount: 1000,
        visionPageCount: 0,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 0,
        contentMode: 'scanned',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    await mockBuildPreambleSegments([
      {
        scope: 'prompt',
        message: { role: 'system', content: 'system' },
        analysisFileIds: [fileId],
      },
    ])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.assistant).toBe(countTextForModel(claude35SonnetModel, 'system'))
    expect(readExtractedTextFromAnalysis).not.toHaveBeenCalled()
  })

  test('estimates mostly visual PDF cost as a draft attachment for OpenAI flagship (gpt41)', async () => {
    const fileId = 'visual-pdf-openai'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 10,
        visionPageCount: 8,
        textCharCount: 50,
        hasExtractableText: true,
        imagePageCount: 8,
        contentMode: 'mixed',
        extractedTextPath: `${file.path}.analysis-v1.txt`,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readExtractedTextFromAnalysis.mockResolvedValue('brief caption text')
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt41Model.id },
      model: gpt41Model,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.estimate.draft).toBe(
      openAiPdfTokens(8, 10, countTextForModel(gpt41Model, normalizeExtractedText('brief caption text')))
    )
  })

  test('estimates mostly visual PDF cost as a draft attachment for Anthropic flagship (claude46Sonnet)', async () => {
    const fileId = 'visual-pdf-anthropic'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 10,
        visionPageCount: 8,
        textCharCount: 50,
        hasExtractableText: true,
        imagePageCount: 8,
        contentMode: 'mixed',
        extractedTextPath: `${file.path}.analysis-v1.txt`,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readExtractedTextFromAnalysis.mockResolvedValue('brief caption text')
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: claude46SonnetModel.id },
      model: claude46SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.estimate.draft).toBe(
      anthropicPdfTokens(8, 10, countTextForModel(claude46SonnetModel, normalizeExtractedText('brief caption text')))
    )
  })

  test('estimates very long visual PDF cost as a draft attachment for OpenAI flagship (gpt41)', async () => {
    const fileId = 'long-visual-pdf-openai'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 200,
        visionPageCount: 180,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 180,
        contentMode: 'scanned',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readExtractedTextFromAnalysis.mockResolvedValue(null)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt41Model.id },
      model: gpt41Model,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    // OpenAI has no native PDF page limit — full regression model applies regardless of length
    expect(result.estimate.draft).toBe(openAiPdfTokens(180, 200, 0))
  })

  test('estimates very long visual PDF cost as a draft attachment for Anthropic flagship (claude46Sonnet)', async () => {
    const fileId = 'long-visual-pdf-anthropic'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 200,
        visionPageCount: 180,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 180,
        contentMode: 'scanned',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: claude46SonnetModel.id },
      model: claude46SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    // 200 pages exceeds Anthropic's 100-page native limit → courtesy text, not regression
    const { getPdfAttachmentPageLimitText } = await import('@/backend/lib/chat/file-attachment-policy')
    const courtesyText = getPdfAttachmentPageLimitText(file, 200, claude46SonnetModel)!
    expect(result.estimate.draft).toBe(countTextForModel(claude46SonnetModel, courtesyText))
    expect(readExtractedTextFromAnalysis).not.toHaveBeenCalled()
  })

  test('estimates text-only PDF cost as a draft attachment for OpenAI flagship (gpt41)', async () => {
    const fileId = 'text-only-pdf-openai'
    const file = makePdfFile(fileId)
    const extractedText = 'This is a long document full of paragraphs and sentences with lots of words.'
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 30,
        visionPageCount: 0,
        textCharCount: extractedText.length,
        hasExtractableText: true,
        imagePageCount: 0,
        contentMode: 'text',
        extractedTextPath: `${file.path}.analysis-v1.txt`,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readExtractedTextFromAnalysis.mockResolvedValue(extractedText)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt41Model.id },
      model: gpt41Model,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.estimate.draft).toBe(
      openAiPdfTokens(0, 30, countTextForModel(gpt41Model, normalizeExtractedText(extractedText)))
    )
  })

  test('estimates text-only PDF cost as a draft attachment for Anthropic flagship (claude46Sonnet)', async () => {
    const fileId = 'text-only-pdf-anthropic'
    const file = makePdfFile(fileId)
    const extractedText = 'This is a long document full of paragraphs and sentences with lots of words.'
    getFileWithId.mockResolvedValue(file)
    ensureFileAnalysis.mockResolvedValue({
      fileId,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        pageCount: 30,
        visionPageCount: 0,
        textCharCount: extractedText.length,
        hasExtractableText: true,
        imagePageCount: 0,
        contentMode: 'text',
        extractedTextPath: `${file.path}.analysis-v1.txt`,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readExtractedTextFromAnalysis.mockResolvedValue(extractedText)
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: claude46SonnetModel.id },
      model: claude46SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    expect(result.estimate.draft).toBe(
      anthropicPdfTokens(0, 30, countTextForModel(claude46SonnetModel, normalizeExtractedText(extractedText)))
    )
  })

  test('falls back to text extraction for PDF draft attachment on OpenAI model without PDF support (gpt35)', async () => {
    const fileId = 'no-pdf-support-openai'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    extractFromFile.mockResolvedValue('extracted pdf content')
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: gpt35Model.id },
      model: gpt35Model,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    const expectedText = `Here is the text content of the file "${file.name}" with id ${file.id}\nextracted pdf content`
    expect(result.estimate.draft).toBe(countTextForModel(gpt35Model, expectedText))
    expect(ensureFileAnalysis).not.toHaveBeenCalled()
    expect(extractFromFile).toHaveBeenCalledWith(file)
  })

  test('falls back to text extraction for PDF draft attachment on Anthropic model without PDF support (claude3Haiku)', async () => {
    const fileId = 'no-pdf-support-anthropic'
    const file = makePdfFile(fileId)
    getFileWithId.mockResolvedValue(file)
    extractFromFile.mockResolvedValue('extracted pdf content')
    await mockBuildPreambleSegments([])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams: { ...assistantParams, model: claude3HaikuModel.id },
      model: claude3HaikuModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [fileId],
    })

    const expectedText = `Here is the text content of the file "${file.name}" with id ${file.id}\nextracted pdf content`
    expect(result.estimate.draft).toBe(countTextForModel(claude3HaikuModel, expectedText))
    expect(ensureFileAnalysis).not.toHaveBeenCalled()
    expect(extractFromFile).toHaveBeenCalledWith(file)
  })

  test('ignores missing analysisFileIds in preamble segments', async () => {
    await mockBuildPreambleSegments([
      {
        scope: 'prompt',
        message: { role: 'system', content: 'system' },
        analysisFileIds: undefined,
      },
    ])

    const { estimateInputTokens } = await import('@/backend/lib/chat/token-estimator')
    const result = await estimateInputTokens({
      assistantParams,
      model: claude35SonnetModel,
      tools: [],
      parameters: {},
      knowledgeFiles: [],
      history: [],
      draftText: '',
      attachmentFileIds: [],
    })

    expect(result.estimate.assistant).toBe(countTextForModel(claude35SonnetModel, 'system'))
  })
})

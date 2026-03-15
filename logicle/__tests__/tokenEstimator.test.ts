import { beforeEach, describe, expect, test, vi } from 'vitest'
import type * as dto from '@/types/dto'
import { claude35SonnetModel } from '@/lib/chat/models/anthropic'
import { gpt41MiniModel } from '@/lib/chat/models/openai'
import { countTextForModel } from '@/lib/chat/tokenizer'
import { normalizeExtractedText, predictPdfTokenCount, resolvePdfEstimatorModel } from '@/lib/chat/pdf-token-estimator'
import { estimateNativeImageTokensFromDimensions } from '@/lib/chat/image-token-estimator'

const getFileWithId = vi.fn()
const ensureFileAnalysis = vi.fn()
const readExtractedTextFromAnalysis = vi.fn()
const readBuffer = vi.fn()

vi.mock('@/models/file', () => ({
  getFileWithId,
}))

vi.mock('@/lib/fileAnalysis', () => ({
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

const assistantParams = {
  model: claude35SonnetModel.id,
  assistantId: 'assistant-1',
  systemPrompt: '',
  temperature: 0,
  tokenLimit: 200000,
  reasoning_effort: null,
} as const

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
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
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

    const chatIndex = await import('@/lib/chat')
    vi.spyOn(chatIndex.ChatAssistant, 'buildPreambleSegments').mockResolvedValue([
      {
        scope: 'prompt',
        message: { role: 'system', content: 'system' },
        analysisFileIds: [fileId],
      },
    ])

    const { estimateInputTokens } = await import('@/lib/chat/token-estimator')
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

    const expectedPdfTokens = Math.ceil(
      predictPdfTokenCount(resolvePdfEstimatorModel(claude35SonnetModel), {
        pageCount: 2,
        visionPageCount: 1,
        textTokenCount: countTextForModel(
          claude35SonnetModel,
          normalizeExtractedText('hello world')
        ),
      })
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

    const chatIndex = await import('@/lib/chat')
    vi.spyOn(chatIndex.ChatAssistant, 'buildPreambleSegments').mockResolvedValue([])

    const { estimateInputTokens } = await import('@/lib/chat/token-estimator')
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

    const chatIndex = await import('@/lib/chat')
    vi.spyOn(chatIndex.ChatAssistant, 'buildPreambleSegments').mockResolvedValue([])

    const { estimateInputTokens } = await import('@/lib/chat/token-estimator')
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
})

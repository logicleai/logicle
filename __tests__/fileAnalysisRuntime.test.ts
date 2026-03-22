import { beforeEach, describe, expect, test, vi } from 'vitest'
import type * as dto from '@/types/dto/file-analysis'

const getFileWithId = vi.fn()
const getFileAnalysis = vi.fn()
const completeFileAnalysis = vi.fn()
const failFileAnalysis = vi.fn()
const inferFileAnalysisKind = vi.fn()
const readBuffer = vi.fn()
const writeBuffer = vi.fn()
const analyzeFileBuffer = vi.fn()
const info = vi.fn()
const warn = vi.fn()
const error = vi.fn()

vi.mock('@/models/file', () => ({
  getFileWithId,
}))

vi.mock('@/models/fileAnalysis', () => ({
  getFileAnalysis,
  completeFileAnalysis,
  failFileAnalysis,
  inferFileAnalysisKind,
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    readBuffer,
    writeBuffer,
  },
}))

vi.mock('@/lib/file-analysis/runtime', () => ({
  getFileAnalyzerRuntime: () => ({ analyzeBuffer: analyzeFileBuffer }),
  setFileAnalyzerRuntime: vi.fn(),
}))

vi.mock('@/lib/logging', () => ({
  logger: {
    info,
    warn,
    error,
  },
}))

const fileEntry = {
  id: 'file-1',
  name: 'example.pdf',
  path: 'files/example.pdf',
  type: 'application/pdf',
  size: 123,
  uploaded: 1 as const,
  createdAt: new Date().toISOString(),
  encrypted: 0 as const,
}

const readyAnalysis: dto.FileAnalysis = {
  fileId: fileEntry.id,
  kind: 'pdf',
  status: 'ready',
  analyzerVersion: 1,
  payload: {
    kind: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    pageCount: 1,
    visionPageCount: 0,
    textCharCount: 11,
    hasExtractableText: true,
    imagePageCount: 0,
    contentMode: 'text',
    extractedTextPath: 'files/example.pdf.analysis-v1.txt',
  },
  error: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('fileAnalysis runtime helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('scheduleFileAnalysisForFile submits to the runtime', async () => {
    const mod = await import('@/lib/file-analysis')
    const submit = vi.spyOn(mod.fileAnalysisRuntime, 'submit').mockResolvedValue()
    mod.scheduleFileAnalysisForFile(fileEntry as any)
    expect(submit).toHaveBeenCalledWith(fileEntry.id)
  })

  test('fileAnalysisRuntime reuses the same promise for duplicate submits', async () => {
    getFileWithId.mockResolvedValue(fileEntry)
    inferFileAnalysisKind.mockReturnValue('pdf')
    readBuffer.mockResolvedValue(Buffer.from('pdf bytes'))
    analyzeFileBuffer.mockImplementation(
      async () =>
        await new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                kind: 'pdf',
                mimeType: 'application/pdf',
                sizeBytes: 123,
                pageCount: 1,
                visionPageCount: 0,
                textCharCount: 0,
                hasExtractableText: false,
                imagePageCount: 0,
                contentMode: 'text',
                extractedText: null,
              }),
            10
          )
        )
    )

    const { fileAnalysisRuntime } = await import('@/lib/file-analysis')
    const first = fileAnalysisRuntime.submit(fileEntry.id)
    const second = fileAnalysisRuntime.submit(fileEntry.id)

    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(completeFileAnalysis).toHaveBeenCalledTimes(1)
  })

  test('ensureFileAnalysisForFile returns current analysis when version is fresh', async () => {
    getFileAnalysis.mockResolvedValue(readyAnalysis)
    const { ensureFileAnalysisForFile } = await import('@/lib/file-analysis')
    await expect(ensureFileAnalysisForFile(fileEntry as any)).resolves.toEqual(readyAnalysis)
  })

  test('ensureFileAnalysisForFile throws on stale completed analysis after waiting', async () => {
    getFileAnalysis.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      ...readyAnalysis,
      analyzerVersion: 0,
    })
    const mod = await import('@/lib/file-analysis')
    vi.spyOn(mod.fileAnalysisRuntime, 'submit').mockResolvedValue()
    await expect(mod.ensureFileAnalysisForFile(fileEntry as any, 1)).rejects.toThrow('stale version 0')
  })

  test('ensureFileAnalysisForFile returns undefined when no completed row appears before timeout', async () => {
    getFileAnalysis.mockResolvedValue(undefined)
    const mod = await import('@/lib/file-analysis')
    vi.spyOn(mod.fileAnalysisRuntime, 'submit').mockImplementation(() => new Promise(() => {}))
    await expect(mod.ensureFileAnalysisForFile(fileEntry as any, 1)).resolves.toBeUndefined()
  })

  test('readExtractedTextFromAnalysis returns null for missing data and on read failure', async () => {
    const mod = await import('@/lib/file-analysis')
    await expect(mod.readExtractedTextFromAnalysis(fileEntry as any, undefined)).resolves.toBeNull()
    readBuffer.mockRejectedValueOnce(new Error('nope'))
    await expect(mod.readExtractedTextFromAnalysis(fileEntry as any, readyAnalysis)).resolves.toBeNull()
    readBuffer.mockRejectedValueOnce('still nope')
    await expect(mod.readExtractedTextFromAnalysis(fileEntry as any, readyAnalysis)).resolves.toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  test('readExtractedTextFromAnalysis returns sidecar content', async () => {
    readBuffer.mockResolvedValue(Buffer.from('hello world'))
    const { readExtractedTextFromAnalysis } = await import('@/lib/file-analysis')
    await expect(readExtractedTextFromAnalysis(fileEntry as any, readyAnalysis)).resolves.toBe('hello world')
  })

  test('analysis type guards detect ready and completed states', async () => {
    const { isReadyFileAnalysis, isCompletedFileAnalysis } = await import('@/lib/file-analysis')
    expect(isReadyFileAnalysis(readyAnalysis)).toBe(true)
    expect(isCompletedFileAnalysis(readyAnalysis)).toBe(true)
    expect(
      isCompletedFileAnalysis({
        ...readyAnalysis,
        status: 'failed',
        payload: null,
      })
    ).toBe(true)
    expect(isReadyFileAnalysis(undefined)).toBe(false)
  })

  test('ensureFileAnalysis waits and returns completed failed analysis', async () => {
    getFileAnalysis.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      ...readyAnalysis,
      status: 'failed',
      payload: null,
    })
    const mod = await import('@/lib/file-analysis')
    vi.spyOn(mod.fileAnalysisRuntime, 'submit').mockResolvedValue()
    await expect(mod.ensureFileAnalysis(fileEntry as any)).resolves.toMatchObject({ status: 'failed' })
  })

  test('ensureFileAnalysis throws if no completed result is persisted', async () => {
    getFileAnalysis.mockResolvedValue(undefined)
    const mod = await import('@/lib/file-analysis')
    vi.spyOn(mod.fileAnalysisRuntime, 'submit').mockResolvedValue()
    await expect(mod.ensureFileAnalysis(fileEntry as any)).rejects.toThrow('did not produce a completed result')
  })

  test('ensurePdfAnalysis returns undefined for non-pdf files', async () => {
    const { ensurePdfAnalysis } = await import('@/lib/file-analysis')
    await expect(ensurePdfAnalysis({ ...fileEntry, type: 'text/plain' } as any)).resolves.toBeUndefined()
  })

  test('ensurePdfAnalysis returns completed analysis for PDFs', async () => {
    getFileAnalysis.mockResolvedValue(readyAnalysis)
    const { ensurePdfAnalysis } = await import('@/lib/file-analysis')
    await expect(ensurePdfAnalysis(fileEntry as any)).resolves.toEqual(readyAnalysis)
  })

  test('fileAnalysisRuntime submits, analyzes, and persists extracted text', async () => {
    getFileWithId.mockResolvedValue(fileEntry)
    inferFileAnalysisKind.mockReturnValue('pdf')
    readBuffer.mockResolvedValue(Buffer.from('pdf bytes'))
    analyzeFileBuffer.mockResolvedValue({
      kind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 123,
      pageCount: 1,
      visionPageCount: 0,
      textCharCount: 11,
      hasExtractableText: true,
      imagePageCount: 0,
      contentMode: 'text',
      extractedText: 'hello world',
    })

    const { fileAnalysisRuntime } = await import('@/lib/file-analysis')
    await fileAnalysisRuntime.submit(fileEntry.id)

    expect(readBuffer).toHaveBeenCalledWith(fileEntry.path, false)
    expect(writeBuffer).toHaveBeenCalledWith(
      `${fileEntry.path}.analysis-v1.txt`,
      Buffer.from('hello world', 'utf-8'),
      false
    )
    expect(completeFileAnalysis).toHaveBeenCalledWith(
      fileEntry.id,
      expect.objectContaining({
        kind: 'pdf',
        extractedTextPath: `${fileEntry.path}.analysis-v1.txt`,
      }),
      1
    )
  })

  test('fileAnalysisRuntime persists failures when analysis throws', async () => {
    getFileWithId.mockResolvedValue({ ...fileEntry, uploaded: 0 })
    inferFileAnalysisKind.mockReturnValue('pdf')

    const { fileAnalysisRuntime } = await import('@/lib/file-analysis')
    await fileAnalysisRuntime.submit(fileEntry.id)

    expect(failFileAnalysis).toHaveBeenCalledWith(
      fileEntry.id,
      'unknown',
      1,
      'File not ready (uploaded=0)'
    )
  })

  test('fileAnalysisRuntime records missing files as unknown failures', async () => {
    getFileWithId.mockResolvedValue(undefined)

    const { fileAnalysisRuntime } = await import('@/lib/file-analysis')
    await fileAnalysisRuntime.submit(fileEntry.id)

    expect(failFileAnalysis).toHaveBeenCalledWith(
      fileEntry.id,
      'unknown',
      1,
      'File not ready (uploaded=missing)'
    )
  })

  test('fileAnalysisRuntime logs persistence failures and keeps pumping the queue', async () => {
    let first = true
    getFileWithId.mockImplementation(async (fileId: string) => {
      if (fileId === 'file-a') return { ...fileEntry, id: 'file-a', path: 'files/a.pdf' }
      return { ...fileEntry, id: 'file-b', path: 'files/b.pdf' }
    })
    inferFileAnalysisKind.mockReturnValue('pdf')
    readBuffer.mockResolvedValue(Buffer.from('pdf bytes'))
    analyzeFileBuffer.mockImplementation(async () => {
      if (first) {
        first = false
        throw new Error('analysis boom')
      }
      return {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 123,
        pageCount: 1,
        visionPageCount: 0,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 0,
        contentMode: 'text',
        extractedText: null,
      }
    })
    failFileAnalysis.mockRejectedValueOnce(new Error('persist boom'))

    const { fileAnalysisRuntime } = await import('@/lib/file-analysis')
    await Promise.all([fileAnalysisRuntime.submit('file-a'), fileAnalysisRuntime.submit('file-b')])

    expect(error).toHaveBeenCalledWith(
      'File analysis runtime: failed to persist failure',
      expect.objectContaining({ fileId: 'file-a' })
    )
    expect(completeFileAnalysis).toHaveBeenCalledWith(
      'file-b',
      expect.objectContaining({ kind: 'pdf', extractedTextPath: null }),
      1
    )
  })

  test('fileAnalysisRuntime stringifies non-Error analysis and persistence failures', async () => {
    getFileWithId.mockResolvedValue(fileEntry)
    inferFileAnalysisKind.mockReturnValue('pdf')
    readBuffer.mockResolvedValue(Buffer.from('pdf bytes'))
    analyzeFileBuffer.mockRejectedValueOnce('analysis boom')
    failFileAnalysis.mockRejectedValueOnce('persist boom')

    const { fileAnalysisRuntime } = await import('@/lib/file-analysis')
    await fileAnalysisRuntime.submit(fileEntry.id)

    expect(failFileAnalysis).toHaveBeenCalledWith(fileEntry.id, 'pdf', 1, 'analysis boom')
    expect(error).toHaveBeenCalledWith(
      'File analysis runtime: failed to persist failure',
      expect.objectContaining({ error: 'persist boom' })
    )
  })
})

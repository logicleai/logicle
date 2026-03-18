import { describe, expect, test } from 'vitest'
import {
  acceptableImageTypes,
  canSendAsNativeFile,
  canSendAsNativeImage,
  createPdfAttachmentLimitText,
  getPdfAttachmentPageLimitText,
  resolvePdfNativeAttachmentDecision,
} from '@/lib/chat/file-attachment-policy'
import type { CompletedFileAnalysis } from '@/lib/fileAnalysis'
import { claude35SonnetModel } from '@/lib/chat/models/anthropic'
import { gpt35Model } from '@/lib/chat/models/openai'
import type * as dto from '@/types/dto'

const pdfFile = { id: 'pdf-1', name: 'example.pdf', type: 'application/pdf' }
const pdfReadyAnalysis: CompletedFileAnalysis = {
  fileId: pdfFile.id,
  kind: 'pdf',
  status: 'ready',
  analyzerVersion: 1,
  payload: {
    kind: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    pageCount: 10,
    visionPageCount: 0,
    textCharCount: 50,
    hasExtractableText: true,
    imagePageCount: 0,
    contentMode: 'text',
    extractedTextPath: null,
  },
  error: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('file attachment policy helpers', () => {
  test('exports acceptable image types and native capability checks', () => {
    expect(acceptableImageTypes).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    expect(canSendAsNativeImage('image/png', { ...gpt35Model.capabilities, vision: true })).toBe(true)
    expect(canSendAsNativeImage('image/svg+xml', { ...gpt35Model.capabilities, vision: true })).toBe(false)
    expect(canSendAsNativeFile('application/pdf', claude35SonnetModel.capabilities)).toBe(true)
    expect(canSendAsNativeFile('text/plain', claude35SonnetModel.capabilities)).toBe(false)
    expect(canSendAsNativeFile('application/pdf', { ...gpt35Model.capabilities })).toBe(false)
  })

  test('formats PDF page-limit text', () => {
    expect(createPdfAttachmentLimitText(pdfFile, 101, 100)).toContain('101 pages, limit is 100')
    expect(getPdfAttachmentPageLimitText({ id: 'a1', name: 'doc.pdf' }, 5, claude35SonnetModel)).toContain('5 pages')
    expect(getPdfAttachmentPageLimitText({ id: 'a1', name: 'doc.pdf' }, 5, gpt35Model)).toBeNull()
  })

  test('resolves native-file when non-pdf or no page limit applies', () => {
    const nonPdfDecision = resolvePdfNativeAttachmentDecision(
      { id: 'img-1', name: 'image.png', type: 'image/png' },
      claude35SonnetModel.capabilities,
      pdfReadyAnalysis as any
    )
    expect(nonPdfDecision).toEqual({ kind: 'native-file' })
  })

  test('resolves analysis failure and unexpected payload fallbacks', () => {
    const failed = resolvePdfNativeAttachmentDecision(pdfFile, claude35SonnetModel.capabilities, {
      ...pdfReadyAnalysis,
      status: 'failed',
      payload: null,
    } as CompletedFileAnalysis)
    expect(failed).toEqual({
      kind: 'text-fallback',
      text: '',
      reason: 'analysis-failed',
    })

    const unexpected = resolvePdfNativeAttachmentDecision(pdfFile, claude35SonnetModel.capabilities, {
      ...pdfReadyAnalysis,
      kind: 'word',
      payload: {
        kind: 'word',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 12,
        textCharCount: 4,
        hasExtractableText: true,
        extractedTextPath: null,
      },
    } as CompletedFileAnalysis)
    expect(unexpected).toEqual({
      kind: 'text-fallback',
      text: '',
      reason: 'unexpected-payload',
    })
  })

  test('resolves page-limit fallback and native-file success', () => {
    const overLimit = resolvePdfNativeAttachmentDecision(pdfFile, claude35SonnetModel.capabilities, {
      ...pdfReadyAnalysis,
      payload: {
        ...pdfReadyAnalysis.payload!,
        kind: 'pdf',
        mimeType: 'application/pdf',
        pageCount: 101,
      },
    } as CompletedFileAnalysis)
    expect(overLimit).toMatchObject({
      kind: 'text-fallback',
      reason: 'page-limit',
    })
    if (overLimit.kind !== 'text-fallback') {
      throw new Error('Expected text-fallback decision')
    }
    expect(overLimit.text).toContain('101 pages, limit is 100')

    const allowed = resolvePdfNativeAttachmentDecision(pdfFile, claude35SonnetModel.capabilities, pdfReadyAnalysis)
    expect(allowed).toEqual({ kind: 'native-file' })
  })
})

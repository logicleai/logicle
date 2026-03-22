import { describe, expect, test } from 'vitest'
import {
  isImageAnalysisPayload,
  isPdfAnalysisPayload,
  isPdfOverNativePageLimit,
} from '@/lib/file-analysis/payload'
import { claude35SonnetModel } from '@/lib/chat/models/anthropic'
import { gpt41MiniModel } from '@/lib/chat/models/openai'
import type * as dto from '@/types/dto'

const pdfPayload: Extract<dto.FileAnalysisPayload, { kind: 'pdf' }> = {
  kind: 'pdf',
  mimeType: 'application/pdf',
  sizeBytes: 123,
  pageCount: 12,
  visionPageCount: 3,
  textCharCount: 400,
  hasExtractableText: true,
  imagePageCount: 2,
  contentMode: 'mixed',
  extractedTextPath: null,
}

const imagePayload: Extract<dto.FileAnalysisPayload, { kind: 'image' }> = {
  kind: 'image',
  mimeType: 'image/png',
  sizeBytes: 456,
  width: 640,
  height: 480,
  frameCount: 1,
  hasAlpha: false,
  format: 'png',
  extractedTextPath: null,
}

describe('fileAnalysisPayload helpers', () => {
  test('detects PDF and image payload kinds', () => {
    expect(isPdfAnalysisPayload(pdfPayload)).toBe(true)
    expect(isPdfAnalysisPayload(imagePayload)).toBe(false)
    expect(isPdfAnalysisPayload(null)).toBe(false)
    expect(isImageAnalysisPayload(imagePayload)).toBe(true)
    expect(isImageAnalysisPayload(pdfPayload)).toBe(false)
  })

  test('reports PDFs over model page limit', () => {
    expect(isPdfOverNativePageLimit(pdfPayload, claude35SonnetModel)).toBe(false)
    const overLimit = { ...pdfPayload, pageCount: 101 }
    expect(isPdfOverNativePageLimit(overLimit, claude35SonnetModel)).toBe(true)
    expect(isPdfOverNativePageLimit(pdfPayload, gpt41MiniModel)).toBe(false)
  })

})

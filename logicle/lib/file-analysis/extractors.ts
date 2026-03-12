import sharp from 'sharp'
import { PDF } from '@libpdf/core'
import mammoth from 'mammoth'
import PPTX2Json from 'pptx2json'
import * as XLSX from 'xlsx'
import * as dto from '@/types/dto'
import { analyzePdfGraphics } from '@/lib/chat/pdf-token-estimator'

const spreadsheetMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

const presentationMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const wordMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const normalizeExtractedText = (text: string) => text.replace(/\s+/g, ' ').trim()

const countTextChars = (text: string) => normalizeExtractedText(text).length

const collectStringsDeep = (value: unknown, sink: string[]) => {
  if (typeof value === 'string') {
    sink.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStringsDeep(entry, sink)
    }
    return
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      collectStringsDeep(nested, sink)
    }
  }
}

export const inferFileAnalysisKind = (mimeType: string): dto.FileAnalysisKind => {
  if (mimeType === 'application/pdf') {
    return 'pdf'
  }
  if (mimeType.startsWith('image/')) {
    return 'image'
  }
  if (spreadsheetMimeTypes.has(mimeType)) {
    return 'spreadsheet'
  }
  if (presentationMimeTypes.has(mimeType)) {
    return 'presentation'
  }
  if (wordMimeTypes.has(mimeType)) {
    return 'word'
  }
  return 'unknown'
}

export const analyzeFileBuffer = async (
  buffer: Buffer,
  mimeType: string
): Promise<dto.FileAnalysisPayload> => {
  switch (inferFileAnalysisKind(mimeType)) {
    case 'pdf':
      return analyzePdf(buffer)
    case 'image':
      return analyzeImage(buffer, mimeType)
    case 'spreadsheet':
      return analyzeSpreadsheet(buffer, mimeType)
    case 'presentation':
      return analyzePresentation(buffer, mimeType)
    case 'word':
      return analyzeWord(buffer, mimeType)
    default:
      return {
        kind: 'unknown',
        mimeType,
        sizeBytes: buffer.byteLength,
      }
  }
}

export const analyzePdf = async (buffer: Buffer): Promise<dto.FileAnalysisPayload> => {
  const pdf = await PDF.load(buffer)
  const pages = pdf.getPages()
  let imagePageCount = 0
  const pageTexts: string[] = []

  for (const page of pages) {
    pageTexts.push(page.extractText().text)
    const graphics = analyzePdfGraphics(
      pdf,
      page as unknown as Parameters<typeof analyzePdfGraphics>[1]
    )
    if (graphics.imageCount > 0) {
      imagePageCount += 1
    }
  }

  const totalPages = pages.length
  const joinedText = pageTexts.join('\n')
  const textCharCount = countTextChars(joinedText)
  const hasExtractableText = textCharCount > 0
  const imageRatio = totalPages === 0 ? 0 : imagePageCount / totalPages
  const contentMode =
    !hasExtractableText && imagePageCount > 0
      ? 'scanned'
      : hasExtractableText && imageRatio < 0.5
        ? 'text'
        : hasExtractableText
          ? 'mixed'
          : 'scanned'

  return {
    kind: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: buffer.byteLength,
    pageCount: totalPages,
    textCharCount,
    hasExtractableText,
    imagePageCount,
    contentMode,
  }
}

export const analyzeImage = async (
  buffer: Buffer,
  mimeType: string
): Promise<dto.FileAnalysisPayload> => {
  const metadata = await sharp(buffer, { animated: true }).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to determine image dimensions')
  }
  return {
    kind: 'image',
    mimeType,
    sizeBytes: buffer.byteLength,
    width: metadata.width,
    height: metadata.height,
    frameCount: Math.max(1, metadata.pages ?? 1),
    hasAlpha: !!metadata.hasAlpha,
    format: metadata.format ?? null,
  }
}

export const analyzeSpreadsheet = async (
  buffer: Buffer,
  mimeType: string
): Promise<dto.FileAnalysisPayload> => {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const texts = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) {
      return ''
    }
    return XLSX.utils.sheet_to_csv(worksheet)
  })
  const textCharCount = countTextChars(texts.join('\n'))
  return {
    kind: 'spreadsheet',
    mimeType,
    sizeBytes: buffer.byteLength,
    sheetCount: workbook.SheetNames.length,
    textCharCount,
    hasExtractableText: textCharCount > 0,
  }
}

export const analyzePresentation = async (
  buffer: Buffer,
  mimeType: string
): Promise<dto.FileAnalysisPayload> => {
  const pptx2json = new PPTX2Json()
  const json = (await pptx2json.buffer2json(buffer)) as Record<string, unknown>
  const slideKeys = Object.keys(json).filter((key) => /^ppt\/slides\/slide\d+\.xml$/.test(key))
  const strings: string[] = []
  for (const slideKey of slideKeys) {
    collectStringsDeep(json[slideKey], strings)
  }
  const textCharCount = countTextChars(strings.join('\n'))
  return {
    kind: 'presentation',
    mimeType,
    sizeBytes: buffer.byteLength,
    slideCount: slideKeys.length,
    textCharCount,
    hasExtractableText: textCharCount > 0,
  }
}

export const analyzeWord = async (
  buffer: Buffer,
  mimeType: string
): Promise<dto.FileAnalysisPayload> => {
  const { value } = await mammoth.extractRawText({ buffer })
  const textCharCount = countTextChars(value)
  return {
    kind: 'word',
    mimeType,
    sizeBytes: buffer.byteLength,
    textCharCount,
    hasExtractableText: textCharCount > 0,
  }
}

import sharp from 'sharp'
import { PDF } from '@libpdf/core'
import mammoth from 'mammoth'
import PPTX2Json from 'pptx2json'
import * as XLSX from 'xlsx'
import type * as dto from '@/types/dto/file-analysis'
import { analyzePdfGraphics } from './chat/pdf-token-estimator'

export type FileAnalysisResult = {
  payload: dto.FileAnalysisPayload
  extractedText: string | null
}

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
    for (const entry of value) collectStringsDeep(entry, sink)
    return
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectStringsDeep(nested, sink)
  }
}

const analyzePdf = async (buffer: Buffer): Promise<FileAnalysisResult> => {
  const pdf = await PDF.load(buffer)
  const pages = pdf.getPages()
  let imagePageCount = 0
  let visionPageCount = 0
  const pageTexts: string[] = []
  for (const page of pages) {
    try { pageTexts.push(page.extractText().text) } catch { pageTexts.push('') }
    const graphics = analyzePdfGraphics(pdf, page as never)
    if (graphics.imageCount > 0) imagePageCount++
    if (graphics.imageCount > 0 || graphics.geometryComplexity >= 150) visionPageCount++
  }
  const extractedText = pageTexts.join('\n')
  const textCharCount = countTextChars(extractedText)
  const hasExtractableText = textCharCount > 0
  const imageRatio = pages.length === 0 ? 0 : imagePageCount / pages.length
  const contentMode = !hasExtractableText && imagePageCount > 0 ? 'scanned'
    : hasExtractableText && imageRatio < 0.5 ? 'text'
    : hasExtractableText ? 'mixed' : 'scanned'
  return {
    payload: { kind: 'pdf', mimeType: 'application/pdf', sizeBytes: buffer.byteLength,
      pageCount: pages.length, visionPageCount, textCharCount, hasExtractableText, imagePageCount, contentMode, extractedTextPath: null },
    extractedText: hasExtractableText ? extractedText : null,
  }
}

const analyzeImage = async (buffer: Buffer, mimeType: string): Promise<FileAnalysisResult> => {
  const metadata = await sharp(buffer, { animated: true }).metadata()
  if (!metadata.width || !metadata.height) throw new Error('Unable to determine image dimensions')
  return {
    payload: { kind: 'image', mimeType, sizeBytes: buffer.byteLength,
      width: metadata.width, height: metadata.height,
      frameCount: Math.max(1, metadata.pages ?? 1), hasAlpha: !!metadata.hasAlpha, format: metadata.format ?? null,
      extractedTextPath: null },
    extractedText: null,
  }
}

const analyzeSpreadsheet = async (buffer: Buffer, mimeType: string): Promise<FileAnalysisResult> => {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const texts = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name] ?? {}))
  const extractedText = texts.join('\n')
  const textCharCount = countTextChars(extractedText)
  return {
    payload: { kind: 'spreadsheet', mimeType, sizeBytes: buffer.byteLength,
      sheetCount: workbook.SheetNames.length, textCharCount, hasExtractableText: textCharCount > 0, extractedTextPath: null },
    extractedText: textCharCount > 0 ? extractedText : null,
  }
}

const analyzePresentation = async (buffer: Buffer, mimeType: string): Promise<FileAnalysisResult> => {
  const json = (await new PPTX2Json().buffer2json(buffer)) as Record<string, unknown>
  const slideKeys = Object.keys(json).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
  const strings: string[] = []
  for (const key of slideKeys) collectStringsDeep(json[key], strings)
  const extractedText = strings.join('\n')
  const textCharCount = countTextChars(extractedText)
  return {
    payload: { kind: 'presentation', mimeType, sizeBytes: buffer.byteLength,
      slideCount: slideKeys.length, textCharCount, hasExtractableText: textCharCount > 0, extractedTextPath: null },
    extractedText: textCharCount > 0 ? extractedText : null,
  }
}

const analyzeWord = async (buffer: Buffer, mimeType: string): Promise<FileAnalysisResult> => {
  const { value } = await mammoth.extractRawText({ buffer })
  const textCharCount = countTextChars(value)
  return {
    payload: { kind: 'word', mimeType, sizeBytes: buffer.byteLength,
      textCharCount, hasExtractableText: textCharCount > 0, extractedTextPath: null },
    extractedText: textCharCount > 0 ? value : null,
  }
}

export const analyzeFileBuffer = async (buffer: Buffer, mimeType: string): Promise<FileAnalysisResult> => {
  if (mimeType === 'application/pdf') return analyzePdf(buffer)
  if (mimeType.startsWith('image/')) return analyzeImage(buffer, mimeType)
  if (spreadsheetMimeTypes.has(mimeType)) return analyzeSpreadsheet(buffer, mimeType)
  if (presentationMimeTypes.has(mimeType)) return analyzePresentation(buffer, mimeType)
  if (wordMimeTypes.has(mimeType)) return analyzeWord(buffer, mimeType)
  return { payload: { kind: 'unknown', mimeType, sizeBytes: buffer.byteLength, extractedTextPath: null }, extractedText: null }
}

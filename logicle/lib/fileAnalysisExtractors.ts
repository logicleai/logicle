import sharp from 'sharp'
import { PDF, PdfDict, PdfName, PdfRef } from '@libpdf/core'
import mammoth from 'mammoth'
import PPTX2Json from 'pptx2json'
import * as XLSX from 'xlsx'
import type * as dto from '@/types/dto/file-analysis'

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

interface LibPdfPageLike {
  index: number
  getContentBytes(): Uint8Array
  getResources(): PdfDict | null
}

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

const analyzePdfGraphics = (pdf: PDF, page: LibPdfPageLike) => {
  const content = new TextDecoder('latin1').decode(page.getContentBytes())
  const xObjectDict = page.getResources()?.get(PdfName.of('XObject'))
  let imageCount = (content.match(/(?:^|[\s])BI(?=[\s\r\n])/g) ?? []).length
  if (xObjectDict instanceof PdfDict) {
    for (const key of xObjectDict.keys()) {
      const name = key instanceof PdfName ? key.value : String(key).replace(/^\//, '')
      const raw = xObjectDict.get(name)
      const obj = raw instanceof PdfRef ? pdf.getObject(raw) : raw
      if (obj instanceof PdfDict && obj.getName('Subtype')?.value === 'Image') {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        imageCount += (content.match(new RegExp(`/${escaped}\\s+Do\\b`, 'g')) ?? []).length
      }
    }
  }
  return imageCount
}

const analyzePdf = async (buffer: Buffer): Promise<dto.FileAnalysisPayload> => {
  const pdf = await PDF.load(buffer)
  const pages = pdf.getPages()
  let imagePageCount = 0
  const pageTexts: string[] = []
  for (const page of pages) {
    try { pageTexts.push(page.extractText().text) } catch { pageTexts.push('') }
    if (analyzePdfGraphics(pdf, page as unknown as LibPdfPageLike) > 0) imagePageCount++
  }
  const textCharCount = countTextChars(pageTexts.join('\n'))
  const hasExtractableText = textCharCount > 0
  const imageRatio = pages.length === 0 ? 0 : imagePageCount / pages.length
  const contentMode = !hasExtractableText && imagePageCount > 0 ? 'scanned'
    : hasExtractableText && imageRatio < 0.5 ? 'text'
    : hasExtractableText ? 'mixed' : 'scanned'
  return { kind: 'pdf', mimeType: 'application/pdf', sizeBytes: buffer.byteLength,
    pageCount: pages.length, textCharCount, hasExtractableText, imagePageCount, contentMode }
}

const analyzeImage = async (buffer: Buffer, mimeType: string): Promise<dto.FileAnalysisPayload> => {
  const metadata = await sharp(buffer, { animated: true }).metadata()
  if (!metadata.width || !metadata.height) throw new Error('Unable to determine image dimensions')
  return { kind: 'image', mimeType, sizeBytes: buffer.byteLength,
    width: metadata.width, height: metadata.height,
    frameCount: Math.max(1, metadata.pages ?? 1), hasAlpha: !!metadata.hasAlpha, format: metadata.format ?? null }
}

const analyzeSpreadsheet = async (buffer: Buffer, mimeType: string): Promise<dto.FileAnalysisPayload> => {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const texts = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name] ?? {}))
  const textCharCount = countTextChars(texts.join('\n'))
  return { kind: 'spreadsheet', mimeType, sizeBytes: buffer.byteLength,
    sheetCount: workbook.SheetNames.length, textCharCount, hasExtractableText: textCharCount > 0 }
}

const analyzePresentation = async (buffer: Buffer, mimeType: string): Promise<dto.FileAnalysisPayload> => {
  const json = (await new PPTX2Json().buffer2json(buffer)) as Record<string, unknown>
  const slideKeys = Object.keys(json).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
  const strings: string[] = []
  for (const key of slideKeys) collectStringsDeep(json[key], strings)
  const textCharCount = countTextChars(strings.join('\n'))
  return { kind: 'presentation', mimeType, sizeBytes: buffer.byteLength,
    slideCount: slideKeys.length, textCharCount, hasExtractableText: textCharCount > 0 }
}

const analyzeWord = async (buffer: Buffer, mimeType: string): Promise<dto.FileAnalysisPayload> => {
  const { value } = await mammoth.extractRawText({ buffer })
  const textCharCount = countTextChars(value)
  return { kind: 'word', mimeType, sizeBytes: buffer.byteLength,
    textCharCount, hasExtractableText: textCharCount > 0 }
}

export const analyzeFileBuffer = async (buffer: Buffer, mimeType: string): Promise<dto.FileAnalysisPayload> => {
  if (mimeType === 'application/pdf') return analyzePdf(buffer)
  if (mimeType.startsWith('image/')) return analyzeImage(buffer, mimeType)
  if (spreadsheetMimeTypes.has(mimeType)) return analyzeSpreadsheet(buffer, mimeType)
  if (presentationMimeTypes.has(mimeType)) return analyzePresentation(buffer, mimeType)
  if (wordMimeTypes.has(mimeType)) return analyzeWord(buffer, mimeType)
  return { kind: 'unknown', mimeType, sizeBytes: buffer.byteLength }
}

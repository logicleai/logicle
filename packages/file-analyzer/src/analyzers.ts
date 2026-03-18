import sharp from 'sharp'
import { PDF, PdfDict, PdfName, PdfRef } from '@libpdf/core'
import mammoth from 'mammoth'
import PPTX2Json from 'pptx2json'
import * as XLSX from 'xlsx'

export type AnalyzerPayload =
  | {
      kind: 'unknown'
      mimeType: string
      sizeBytes: number
      extractedText: null
    }
  | {
      kind: 'pdf'
      mimeType: 'application/pdf'
      sizeBytes: number
      pageCount: number
      visionPageCount: number
      textCharCount: number
      hasExtractableText: boolean
      imagePageCount: number
      contentMode: 'text' | 'mixed' | 'scanned'
      extractedText: string | null
    }
  | {
      kind: 'image'
      mimeType: string
      sizeBytes: number
      width: number
      height: number
      frameCount: number
      hasAlpha: boolean
      format: string | null
      extractedText: null
    }
  | {
      kind: 'spreadsheet'
      mimeType: string
      sizeBytes: number
      sheetCount: number
      textCharCount: number
      hasExtractableText: boolean
      extractedText: string | null
    }
  | {
      kind: 'presentation'
      mimeType: string
      sizeBytes: number
      slideCount: number
      textCharCount: number
      hasExtractableText: boolean
      extractedText: string | null
    }
  | {
      kind: 'word'
      mimeType: string
      sizeBytes: number
      textCharCount: number
      hasExtractableText: boolean
      extractedText: string | null
    }

// ─── PDF graphics analysis (used to determine visionPageCount) ───────────────

interface LibPdfPageLike {
  index: number
  getContentBytes(): Uint8Array
  getResources(): PdfDict | null
  extractText(): { text: string }
}

type PageGraphicsAnalysis = {
  imageCount: number
  geometryComplexity: number
}

export const analyzePdfGraphics = (pdf: PDF, page: LibPdfPageLike): PageGraphicsAnalysis => {
  const contentBytes = page.getContentBytes()
  const content = new TextDecoder('latin1').decode(contentBytes)
  const imageXObjects = getImageXObjects(pdf, page.getResources(), page.index + 1)

  let imageCount = countInlineImages(content)
  for (const imageXObject of imageXObjects) {
    imageCount += countPaintXObjectUsages(content, imageXObject.name)
  }

  return {
    imageCount,
    geometryComplexity: estimateGeometryComplexity(content),
  }
}

const getImageXObjects = (
  pdf: PDF,
  resources: PdfDict | null,
  pageNumber: number
): Array<{ name: string; id: string }> => {
  const images: Array<{ name: string; id: string }> = []
  const xObjectDict = resources?.get(PdfName.of('XObject'))
  if (!(xObjectDict instanceof PdfDict)) return images

  for (const key of xObjectDict.keys()) {
    const operatorName = pdfNameToOperatorName(key)
    const rawValue = xObjectDict.get(operatorName)
    const xObject = resolvePdfObject(pdf, rawValue)
    if (!(xObject instanceof PdfDict)) continue
    if (xObject.getName('Subtype')?.value === 'Image') {
      images.push({ name: operatorName, id: pdfObjectIdentity(rawValue, pageNumber, operatorName) })
    }
  }
  return images
}

const resolvePdfObject = (pdf: PDF, value: unknown): unknown =>
  value instanceof PdfRef ? pdf.getObject(value) : value

const pdfNameToOperatorName = (value: unknown): string =>
  value instanceof PdfName ? value.value : String(value).replace(/^\//, '')

const pdfObjectIdentity = (value: unknown, pageNumber: number, operatorName: string): string =>
  value instanceof PdfRef ? String(value) : `page:${pageNumber}:${operatorName}`

const countPaintXObjectUsages = (content: string, xObjectName: string): number => {
  const escapedName = xObjectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return content.match(new RegExp(`/${escapedName}\\s+Do\\b`, 'g'))?.length ?? 0
}

const countInlineImages = (content: string): number =>
  content.match(/(?:^|[\s])BI(?=[\s\r\n])/g)?.length ?? 0

const estimateGeometryComplexity = (content: string): number =>
  content.match(/\b(?:S|s|f|F|f\*|B|B\*|b|b\*|Do|BI|EI)\b/g)?.length ?? 0

// ─── Format analyzers ─────────────────────────────────────────────────────────

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
  if (typeof value === 'string') { sink.push(value); return }
  if (Array.isArray(value)) { for (const entry of value) collectStringsDeep(entry, sink); return }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectStringsDeep(nested, sink)
  }
}

const analyzePdf = async (buffer: Buffer): Promise<AnalyzerPayload> => {
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
    kind: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: buffer.byteLength,
    pageCount: pages.length,
    visionPageCount,
    textCharCount,
    hasExtractableText,
    imagePageCount,
    contentMode,
    extractedText: hasExtractableText ? extractedText : null,
  }
}

const analyzeImage = async (buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> => {
  const metadata = await sharp(buffer, { animated: true }).metadata()
  if (!metadata.width || !metadata.height) throw new Error('Unable to determine image dimensions')
  return {
    kind: 'image',
    mimeType,
    sizeBytes: buffer.byteLength,
    width: metadata.width,
    height: metadata.height,
    frameCount: Math.max(1, metadata.pages ?? 1),
    hasAlpha: !!metadata.hasAlpha,
    format: metadata.format ?? null,
    extractedText: null,
  }
}

const analyzeSpreadsheet = async (buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> => {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const texts = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name] ?? {}))
  const extractedText = texts.join('\n')
  const textCharCount = countTextChars(extractedText)
  return {
    kind: 'spreadsheet',
    mimeType,
    sizeBytes: buffer.byteLength,
    sheetCount: workbook.SheetNames.length,
    textCharCount,
    hasExtractableText: textCharCount > 0,
    extractedText: textCharCount > 0 ? extractedText : null,
  }
}

const analyzePresentation = async (buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> => {
  const json = (await new PPTX2Json().buffer2json(buffer)) as Record<string, unknown>
  const slideKeys = Object.keys(json).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
  const strings: string[] = []
  for (const key of slideKeys) collectStringsDeep(json[key], strings)
  const extractedText = strings.join('\n')
  const textCharCount = countTextChars(extractedText)
  return {
    kind: 'presentation',
    mimeType,
    sizeBytes: buffer.byteLength,
    slideCount: slideKeys.length,
    textCharCount,
    hasExtractableText: textCharCount > 0,
    extractedText: textCharCount > 0 ? extractedText : null,
  }
}

const analyzeWord = async (buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> => {
  const { value } = await mammoth.extractRawText({ buffer })
  const textCharCount = countTextChars(value)
  return {
    kind: 'word',
    mimeType,
    sizeBytes: buffer.byteLength,
    textCharCount,
    hasExtractableText: textCharCount > 0,
    extractedText: textCharCount > 0 ? value : null,
  }
}

export const analyzeFileBuffer = async (buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> => {
  if (mimeType === 'application/pdf') return analyzePdf(buffer)
  if (mimeType.startsWith('image/')) return analyzeImage(buffer, mimeType)
  if (spreadsheetMimeTypes.has(mimeType)) return analyzeSpreadsheet(buffer, mimeType)
  if (presentationMimeTypes.has(mimeType)) return analyzePresentation(buffer, mimeType)
  if (wordMimeTypes.has(mimeType)) return analyzeWord(buffer, mimeType)
  return { kind: 'unknown', mimeType, sizeBytes: buffer.byteLength, extractedText: null }
}

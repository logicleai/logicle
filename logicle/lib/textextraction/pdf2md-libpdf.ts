import { PDF } from '@libpdf/core'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const Page = require('../vendor/pdf2md/models/Page')
const TextItem = require('../vendor/pdf2md/models/TextItem')
const { makeTransformations, transform } = require('../vendor/pdf2md/util/transformations')

type LibPdfChar = {
  char: string
  bbox: {
    x: number
    y: number
    width: number
    height: number
  }
  fontSize: number
  fontName: string
}

type LibPdfLine = {
  spans?: Array<{
    chars?: LibPdfChar[]
  }>
}

type LibPdfExtractedPage = {
  height?: number
  lines: LibPdfLine[]
}

type FontStore = {
  ids: Set<string>
  map: Map<string, { name?: string }>
}

const normalizeChar = (char: string) => {
  if (char === '\t' || char === '\r' || char === '\n') {
    return ' '
  }
  return char
}

const normalizeFontName = (fontName: string) => {
  const withoutSubset = fontName.replace(/^[A-Z]{6}\+/, '')
  return withoutSubset.replace(/[,_-]+/g, ' ').trim() || '__unknown_font__'
}

const toPdf2mdY = (pageHeight: number, char: LibPdfChar) => {
  const top = char.bbox.y
  const height = char.fontSize || char.bbox.height || 1
  return Math.round(pageHeight - top - height)
}

const pageToTextItems = (page: LibPdfExtractedPage, pageIndex: number, fonts: FontStore) => {
  const items: InstanceType<typeof TextItem>[] = []
  const pageHeight = page.height ?? 0

  for (const line of page.lines) {
    const spans = line.spans ?? []
    for (const span of spans) {
      const chars = span.chars ?? []
      for (const char of chars) {
        const fontId = normalizeFontName(char.fontName || '__unknown_font__')
        if (!fonts.ids.has(fontId)) {
          fonts.ids.add(fontId)
          fonts.map.set(fontId, { name: fontId })
        }

        items.push(
          new TextItem({
            x: Math.round(char.bbox.x),
            y: toPdf2mdY(pageHeight, char),
            width: Math.max(1, Math.round(char.bbox.width)),
            height: Math.max(1, Math.round(char.fontSize || char.bbox.height || 1)),
            text: normalizeChar(char.char),
            font: fontId,
            pageIndex,
          })
        )
      }
    }
  }

  return items
}

export const pdf2mdLibpdf = async (pdfBuffer: Buffer): Promise<string> => {
  const pdf = await PDF.load(pdfBuffer)
  const fonts: FontStore = {
    ids: new Set(),
    map: new Map(),
  }

  const pages = pdf.getPages().map((page, index) => {
    const extracted = withSuppressedLibpdfFontWarnings(() => page.extractText()) as LibPdfExtractedPage
    return new Page({
      index,
      items: pageToTextItems(extracted, index, fonts),
    })
  })

  const transformations = makeTransformations(fonts.map)
  const parseResult = transform(pages, transformations)
  return parseResult.pages.map((page: any) => page.items.join('\n') + '\n').join('')
}

const withSuppressedLibpdfFontWarnings = <T>(fn: () => T): T => {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    const [first] = args
    if (typeof first === 'string' && first.startsWith('Failed to parse FontFile (Type1):')) {
      return
    }
    originalError(...args)
  }
  try {
    return fn()
  } finally {
    console.error = originalError
  }
}

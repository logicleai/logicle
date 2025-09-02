import { PDFExtract, PDFExtractResult, PDFExtractText } from 'pdf.js-extract'
import { TextExtractor } from '.'

// Tune these to taste (in PDF user-space units)
const Y_TOL = 2.0 // items within this y-delta are considered same line
const WORD_GAP = 2.5 // x-gap that implies a space between items
const PARA_GAP_MULT = 0.8 // paragraphs when vertical gap > (avg line height * this)
const HEADING_FACTOR = 1.28 // font size multiplier over median to consider a heading
const MAX_HEADING_LEN = 90 // avoid promoting very long lines to headings

function pagesToMarkdown(res: PDFExtractResult): string {
  const parts: string[] = []

  for (const page of res.pages) {
    const lines = groupIntoLines(page.content)
    const mdLines = linesToMarkdown(lines)
    parts.push(mdLines.join('\n'))
  }

  return parts.join('\n\n---\n\n') // page separator
}

type LineItem = PDFExtractText & { fontSize: number }
type Line = { y: number; h: number; text: string; fontAvg: number }

function groupIntoLines(items: PDFExtractText[]): Line[] {
  // enrich with a font size estimate; fall back if missing
  const enriched: LineItem[] = items.map((it) => ({
    ...it,
    fontSize: typeof it.height === 'number' && it.height > 0 ? it.height : 10,
  }))

  // sort top→bottom, then left→right
  enriched.sort((a, b) => (Math.abs(b.y - a.y) <= Y_TOL ? a.x - b.x : b.y - a.y))

  const lines: { y: number; items: LineItem[] }[] = []
  for (const it of enriched) {
    const last = lines[lines.length - 1]
    if (!last || Math.abs(last.y - it.y) > Y_TOL) {
      lines.push({ y: it.y, items: [it] })
    } else {
      last.items.push(it)
    }
  }

  // build text for each line with spacing heuristics
  const result: Line[] = lines.map((ln) => {
    // left→right just in case
    ln.items.sort((a, b) => a.x - b.x)

    let text = ''
    for (let i = 0; i < ln.items.length; i++) {
      const cur = ln.items[i]
      const prev = ln.items[i - 1]
      const needsSpace =
        i > 0 &&
        cur.str &&
        prev &&
        // add a space if the visual gap suggests separate tokens and neither side already has one
        cur.x - (prev.x + prev.width) > WORD_GAP &&
        !/\s$/.test(text) &&
        !/^\s/.test(cur.str)

      if (needsSpace) text += ' '
      text += cur.str
    }

    const avgFont = ln.items.reduce((s, it) => s + it.fontSize, 0) / Math.max(1, ln.items.length)

    // line height proxy = average font size on that line
    return { y: ln.y, h: avgFont, text: text.trim(), fontAvg: avgFont }
  })

  return result
}

function linesToMarkdown(lines: Line[]): string[] {
  if (lines.length === 0) return []

  // median font size across the page – used for heading detection
  const fonts = lines.map((l) => l.fontAvg).sort((a, b) => a - b)
  const medianFont = fonts[Math.floor(fonts.length / 2)] || 12

  const md: string[] = []
  let paraBuf: string[] = []

  const flushPara = () => {
    if (paraBuf.length) {
      md.push(paraBuf.join(' '))
      paraBuf = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]
    const prev = lines[i - 1]

    // blank-ish lines → paragraph break
    if (!cur.text) {
      flushPara()
      continue
    }

    // detect list items
    const isBullet = /^\s*([•\-–—·]|(\d+|[a-zA-Z])[\.\)])\s+/.test(cur.text)

    // detect heading by larger font
    const isHeading =
      cur.text.length <= MAX_HEADING_LEN &&
      cur.fontAvg >= medianFont * HEADING_FACTOR &&
      // ignore if it also looks like a list line
      !isBullet

    // paragraph gap heuristic from vertical distance
    const paraGap = prev
      ? Math.abs(prev.y - cur.y) > Math.max(prev.h, cur.h) * (1 + PARA_GAP_MULT)
      : false

    if (isHeading) {
      flushPara()
      md.push(`# ${normalizeSpaces(cur.text)}`)
      continue
    }

    if (isBullet) {
      // if we were in a paragraph, end it and start a list block
      flushPara()
      md.push(
        `- ${normalizeSpaces(cur.text.replace(/^\s*([•\-–—·]|(\d+|[a-zA-Z])[\.\)])\s+/, ''))}`
      )
      continue
    }

    if (paraGap) {
      // paragraph break
      flushPara()
      paraBuf.push(normalizeSpaces(cur.text))
    } else {
      // same paragraph → append
      paraBuf.push(normalizeSpaces(cur.text))
    }
  }

  flushPara()
  return md
}

function normalizeSpaces(s: string): string {
  // collapse weird spacing that often appears in PDFs
  return s.replace(/\s+/g, ' ').trim()
}

export const pdfExtractor: TextExtractor = async (data: Buffer) => {
  return new Promise((resolve, reject) => {
    const pdfExtract = new PDFExtract()
    const options = { normalizeWhitespace: true }

    pdfExtract.extractBuffer(data, options, (err, out) => {
      if (err) return reject(err)
      if (!out) return reject(new Error('No data extracted'))

      try {
        const md = pagesToMarkdown(out)
        resolve(md)
      } catch (e) {
        reject(e)
      }
    })
  })
}

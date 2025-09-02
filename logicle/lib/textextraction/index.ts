import mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import { ensureABView } from '../utils'
import { sheetToMarkdown } from './xlstomarkdown'
import micromatch from 'micromatch'
import { gfm } from 'turndown-plugin-gfm'
import TurndownService, { Node as TurndownNode } from 'turndown'
import { PDFExtract, PDFExtractResult, PDFExtractText } from 'pdf.js-extract'

type TextExtractor = (buffer: Buffer, options?: Options) => Promise<string>
interface Options {
  keepImages?: boolean
}

function hasGetAttribute(n: unknown): n is { getAttribute(name: string): string | null } {
  return !!n && typeof (n as any).getAttribute === 'function'
}

function createTurndown(options?: Options) {
  const td = new TurndownService({
    headingStyle: 'atx', // # H1, ## H2, ...
    codeBlockStyle: 'fenced', // ``` fenced blocks
    bulletListMarker: '-', // -, *, or +
    emDelimiter: '_', // _emphasis_ vs *emphasis*
    br: '\n', // <br> → newline
  })

  // Enable GitHub-flavored Markdown features
  td.use([gfm])

  td.addRule('forceGfmTables', {
    filter: (node) => node.nodeName === 'TABLE',
    replacement: (_content, node) => {
      const table = node as HTMLTableElement
      const rows = Array.from(table.rows) as HTMLTableRowElement[]
      if (!rows.length) return '\n\n'

      // pick header: <thead> first row, else first row
      const headRow = (table.tHead && table.tHead.rows[0]) || rows[0] || null
      const bodyRows =
        headRow && table.tHead
          ? Array.from(table.tBodies).flatMap((tb) => Array.from(tb.rows))
          : rows.slice(1)

      const headerCells = headRow ? Array.from(headRow.cells) : []
      if (!headerCells.length) return '\n\n'

      const cellToText = (cell: HTMLTableCellElement) => {
        // Convert inner HTML to inline MD, then flatten to one line
        let text = td
          .turndown(cell.innerHTML)
          .replace(/\n+/g, '<br>') // keep hard breaks inside cells
          .replace(/\|/g, '\\|') // escape pipes
          .trim()
        return text
      }

      const getAlign = (cell: HTMLTableCellElement): 'left' | 'center' | 'right' | 'none' => {
        const attr = (cell.getAttribute('align') || '').toLowerCase()
        if (attr === 'center' || attr === 'right' || attr === 'left') return attr as any
        const style = (cell.getAttribute('style') || '').toLowerCase()
        if (/text-align:\s*center/.test(style)) return 'center'
        if (/text-align:\s*right/.test(style)) return 'right'
        if (/text-align:\s*left/.test(style)) return 'left'
        return 'none'
      }

      // If there are complex spans, we still attempt a best-effort markdown table.
      const hasSpans =
        headerCells.some((c) => c.colSpan > 1 || c.rowSpan > 1) ||
        bodyRows.some((r) => Array.from(r.cells).some((c) => c.colSpan > 1 || c.rowSpan > 1))

      const header = headerCells.map(cellToText)
      const aligns = headerCells
        .map(getAlign)
        .map((a) =>
          a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'
        )

      const toRow = (cols: string[]) => `| ${cols.join(' | ')} |`

      const body = bodyRows.map((r) => {
        const cells = Array.from(r.cells) as HTMLTableCellElement[]
        // pad/truncate to header width for sanity
        const cols = cells.slice(0, header.length).map(cellToText)
        while (cols.length < header.length) cols.push('')
        return toRow(cols)
      })

      const md = [toRow(header), toRow(aligns), ...body].join('\n')

      // If spans existed, this is best-effort; still better than raw HTML.
      return `\n\n${md}\n\n`
    },
  })

  td.addRule('fencedCodeWithLanguage', {
    filter: (node) => {
      return node.nodeName === 'PRE' && (node as HTMLElement).firstElementChild?.nodeName === 'CODE'
    },
    replacement: (_content, node) => {
      const codeEl = (node as HTMLElement).firstElementChild as HTMLElement
      const className = (codeEl.getAttribute('class') || '').toLowerCase()

      // Extract language (supports language-xxx or lang-xxx)
      const lang =
        className.match(/language-([\w-]+)/)?.[1] ||
        className.match(/lang(?:uage)?-([\w-]+)/)?.[1] ||
        ''

      const codeText = (codeEl.textContent || '').trimEnd()
      const fence = '```'

      return `\n${fence}${lang}\n${codeText}\n${fence}\n`
    },
  })

  // --- Replace images with a placeholder ---
  if (options?.keepImages ?? false) {
    td.addRule('cleanImages', {
      filter: 'img',
      replacement: (_content: string, node: TurndownNode) => {
        // Narrow the turndown node to something with getAttribute
        if (!hasGetAttribute(node)) return '' // or fall back to default behavior

        const alt = (node.getAttribute('alt') || '').replace(/\n/g, ' ')
        const src = node.getAttribute('src') || ''
        const title = node.getAttribute('title')

        return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
      },
    }) // Optionally keep line breaks inside paragraphs (helps with Word line breaks)
  } else {
    td.addRule('stripImages', {
      filter: 'img',
      replacement: () => '[image]',
    })
  }

  td.keep(['br'])

  return td
}

const wordExtractor: TextExtractor = async (data: Buffer) => {
  const { value: html } = await mammoth.convertToHtml({
    buffer: data,
  })
  const turndown = createTurndown()
  const markdown = turndown.turndown(html)
  return markdown
}

const excelExtractor: TextExtractor = async (data: Buffer) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(ensureABView(data).buffer)
  const ws = wb.worksheets[0]
  return sheetToMarkdown(ws, { headerRow: 1 })
}

const genericTextExtractor: TextExtractor = async (data: Buffer) => {
  return data.toString('utf8')
}

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

const pdfExtractor: TextExtractor = async (data: Buffer) => {
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

export const textExtractors: Record<string, TextExtractor> = {
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']: wordExtractor,
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']: excelExtractor,
  ['application/pdf']: pdfExtractor,
  ['text/*']: genericTextExtractor,
}

export const findExtractor = (fileType: string) => {
  return Object.entries(textExtractors).find(([_fileType, _converter]) => {
    return micromatch.isMatch(fileType, _fileType)
  })?.[1]
}

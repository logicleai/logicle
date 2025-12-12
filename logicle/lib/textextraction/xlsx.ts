import { TextExtractor } from '.'
import * as XLSX from 'xlsx'
import { ensureABView } from '../utils'

type Align = 'left' | 'center' | 'right'

interface Options {
  /** 1-based header row index (default 1) */
  headerRow?: number
  /** Trim trailing all-empty columns (default true) */
  trimEmptyRight?: boolean
}

function sheetToMarkdown(
  worksheet: XLSX.WorkSheet,
  { headerRow = 1, trimEmptyRight = true }: Options = {}
): string {
  // SheetJS uses !ref to define the used range like "A1:C10"
  const ref = worksheet['!ref']
  if (!ref) return '' // empty sheet

  const range = XLSX.utils.decode_range(ref)

  const rows: unknown[][] = []

  // Build a 2D array of values from the worksheet
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = worksheet[addr] as XLSX.CellObject | undefined
      // .v is the raw value (string | number | boolean | Date | null | undefined)
      row.push(cell ? cell.v : null)
    }
    rows.push(row)
  }

  if (rows.length === 0) return ''

  // Determine last non-empty column (or keep all if disabled)
  let lastCol = rows.reduce((max, r) => {
    for (let i = r.length - 1; i >= 0; i--) {
      const v = r[i]
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return Math.max(max, i + 1)
      }
    }
    return max
  }, 0)

  if (!trimEmptyRight) {
    lastCol = Math.max(...rows.map((r) => r.length))
  }

  const table = rows.map((r) => r.slice(0, lastCol))

  const header = (table[headerRow - 1] ?? []).map(escapeCell)
  const aligns = inferAlignments(table, headerRow)

  const lines: string[] = []
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(
    `| ${aligns
      .map((a) => (a === 'right' ? '---:' : a === 'center' ? ':---:' : ':---'))
      .join(' | ')} |`
  )

  for (let r = headerRow; r < table.length; r++) {
    const line = table[r]
      .map((v, c) => formatCell(v, aligns[c]))
      .map(escapeCell)
      .join(' | ')
    lines.push(`| ${line} |`)
  }

  return lines.join('\n')
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim()
}

function formatCell(v: unknown, _align: Align): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)

  // Keeping this in case you ever pass richer objects through
  if (typeof v === 'object') {
    if (typeof (v as any).text === 'string') return (v as any).text
    if (Array.isArray((v as any).richText)) {
      return (v as any).richText.map((rt: { text: string }) => rt.text).join('')
    }
  }

  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

function inferAlignments(table: unknown[][], headerRow: number): Align[] {
  const cols = Math.max(...table.map((r) => r.length))
  const aligns: Align[] = new Array(cols).fill('left')

  for (let c = 0; c < cols; c++) {
    let num = 0,
      date = 0,
      bool = 0,
      nonEmpty = 0
    for (let r = headerRow; r < table.length; r++) {
      const v = table[r][c]
      if (v === null || v === undefined || String(v).trim() === '') continue
      nonEmpty++
      if (v instanceof Date) date++
      else if (typeof v === 'number') num++
      else if (typeof v === 'boolean') bool++
    }
    if (nonEmpty === 0) aligns[c] = 'left'
    else if (num / nonEmpty >= 0.6) aligns[c] = 'right'
    else if ((date + bool) / nonEmpty >= 0.6) aligns[c] = 'center'
    else aligns[c] = 'left'
  }
  return aligns
}

function trimEmptyMarkdownRows(markdown: string): string {
  const lines = markdown.split('\n')

  // Walk backwards until we find a non-empty data row
  let end = lines.length
  while (end > 0) {
    const line = lines[end - 1].trim()

    // stop if it's not a "table row" (i.e. doesn't start with "|")
    if (!line.startsWith('|')) break

    // check if row has only empty cells (like "|  |  |")
    const onlyEmpty = line
      .split('|')
      .slice(1, -1) // drop edges
      .every((cell) => cell.trim() === '')

    if (onlyEmpty) {
      end-- // drop this line
    } else {
      break // found a real row
    }
  }

  return lines.slice(0, end).join('\n')
}

export const xlsxExtractor: TextExtractor = async (data: Buffer) => {
  // ensureABView should give us something ArrayBufferView-like (e.g. Uint8Array)
  const abv = ensureABView(data)

  // Use SheetJS to read the workbook from a typed array
  const wb = XLSX.read(abv, { type: 'array' })

  const sections: string[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    let body = ''
    try {
      // You’ll need sheetToMarkdown to accept a SheetJS worksheet now
      body = sheetToMarkdown(ws, { headerRow: 1 }) || ''
    } catch (e) {
      body = `> _Failed to parse sheet "${sheetName}": ${(e as Error).message}_`
    }

    const cleaned = trimEmptyMarkdownRows(body).trim()
    if (cleaned) {
      sections.push(`## ${sheetName}\n\n${cleaned}`)
    }
  }

  return sections.join('\n\n')
}

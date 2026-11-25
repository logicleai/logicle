import type ExcelJS from 'exceljs'
import type { CellValue } from 'exceljs'
import { SpreadsheetBudget } from '@/lib/spreadsheet-budget'

export type Align = 'left' | 'center' | 'right'

export interface Options {
  /** 1-based header row index (default 1) */
  headerRow?: number
  /** Trim trailing all-empty columns (default true) */
  trimEmptyRight?: boolean
}

/** ExcelJS Row.values may be array, object map, or undefined. Normalize to a 1-based array. */
function getRowValues(row: ExcelJS.Row): CellValue[] {
  const v = row.values as unknown

  if (Array.isArray(v)) return v as CellValue[]

  if (v && typeof v === 'object') {
    // Convert the 1-based index map into an array
    const out: CellValue[] = []
    for (const [k, val] of Object.entries(v as Record<string, CellValue>)) {
      const idx = Number(k)
      if (Number.isInteger(idx)) out[idx] = val
    }
    return out
  }

  return [] // treat null/undefined as empty row
}

export function sheetToMarkdown(
  worksheet: ExcelJS.Worksheet,
  options: Options = {},
  budget = new SpreadsheetBudget()
): string {
  budget.addRange(worksheet.rowCount, worksheet.columnCount)
  const rows: unknown[][] = []
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    // ExcelJS row.values[0] is always undefined
    const values = getRowValues(row) // ✅ always an array now
    rows.push(values.slice(1))
  })

  return rowsToMarkdown(rows, options, budget)
}

export function rowsToMarkdown(
  rows: unknown[][],
  { headerRow = 1, trimEmptyRight = true }: Options,
  budget: SpreadsheetBudget
): string {
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

  if (!trimEmptyRight) lastCol = rows.reduce((width, row) => Math.max(width, row.length), 0)
  const table = rows.map((r) => r.slice(0, lastCol))

  const aligns = inferAlignments(table, headerRow)
  const lines: string[] = []
  const appendRow = (cells: unknown[], render: (value: unknown, column: number) => string) => {
    budget.addBytes(4 + Math.max(0, cells.length - 1) * 3 + (lines.length ? 1 : 0))
    const fields = cells.map((value, column) => {
      const field = render(value, column)
      budget.addBytes(Buffer.byteLength(field))
      return field
    })
    lines.push(`| ${fields.join(' | ')} |`)
  }
  appendRow(table[headerRow - 1] ?? [], escapeCell)
  appendRow(aligns, (align) => (align === 'right' ? '---:' : align === 'center' ? ':---:' : ':---'))
  for (let r = headerRow; r < table.length; r++) {
    appendRow(table[r], (value, c) => escapeCell(formatCell(value, aligns[c])))
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

  // ExcelJS may give objects for hyperlinks / rich text runs
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
  const cols = table.reduce((width, row) => Math.max(width, row.length), 0)
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

import { TextExtractor } from '.'
import * as XLSX from 'xlsx'
import { ensureABView } from '@/backend/lib/utils'
import { rowsToMarkdown } from './xlstomarkdown'
import { SpreadsheetBudget, SpreadsheetLimitError } from '@/lib/spreadsheet-budget'

function sheetToMarkdown(worksheet: XLSX.WorkSheet, budget: SpreadsheetBudget): string {
  const ref = worksheet['!ref']
  if (!ref) return '' // empty sheet

  const range = XLSX.utils.decode_range(ref)

  budget.addRange(range.e.r - range.s.r + 1, range.e.c - range.s.c + 1)
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

  return rowsToMarkdown(rows, {}, budget)
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
  const wb = XLSX.read(abv, { type: 'array', nodim: true })

  const budget = new SpreadsheetBudget()
  const sections: string[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    let body = ''
    try {
      body = sheetToMarkdown(ws, budget) || ''
    } catch (e) {
      if (e instanceof SpreadsheetLimitError) throw e
      body = `> _Failed to parse sheet "${sheetName}": ${(e as Error).message}_`
      budget.addBytes(Buffer.byteLength(body))
    }

    const cleaned = trimEmptyMarkdownRows(body).trim()
    if (cleaned) {
      budget.addBytes(Buffer.byteLength(sheetName) + 5 + (sections.length ? 2 : 0))
      sections.push(`## ${sheetName}\n\n${cleaned}`)
    }
  }

  return sections.join('\n\n')
}

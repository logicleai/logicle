import { describe, expect, test } from 'vitest'
import { sheetToMarkdown } from '@/lib/textextraction/xlstomarkdown'
import ExcelJS from 'exceljs'

// ---- helpers ----

function makeSheet(rows: unknown[][]): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  for (const row of rows) {
    ws.addRow(row)
  }
  return ws
}

// ---- sheetToMarkdown ----

describe('sheetToMarkdown', () => {
  test('returns empty string for empty worksheet', () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Empty')
    expect(sheetToMarkdown(ws)).toBe('')
  })

  test('produces header and separator row', () => {
    const ws = makeSheet([['Name', 'Age'], ['Alice', 30]])
    const result = sheetToMarkdown(ws)
    const lines = result.split('\n')
    expect(lines[0]).toBe('| Name | Age |')
    expect(lines[1]).toMatch(/^\|.*\|$/) // separator row
  })

  test('right-aligns columns that are ≥60% numeric', () => {
    const ws = makeSheet([
      ['Label', 'Score'],
      ['a', 10],
      ['b', 20],
      ['c', 30],
    ])
    const result = sheetToMarkdown(ws)
    expect(result).toContain('---:')
  })

  test('left-aligns text columns', () => {
    const ws = makeSheet([
      ['Name'],
      ['Alice'],
      ['Bob'],
      ['Carol'],
    ])
    const result = sheetToMarkdown(ws)
    expect(result).toContain(':---')
    expect(result).not.toContain('---:')
  })

  test('center-aligns columns that are ≥60% dates', () => {
    const d1 = new Date('2024-01-01')
    const d2 = new Date('2024-02-01')
    const d3 = new Date('2024-03-01')
    const ws = makeSheet([['Date'], [d1], [d2], [d3]])
    const result = sheetToMarkdown(ws)
    expect(result).toContain(':---:')
  })

  test('formats dates as YYYY-MM-DD', () => {
    const ws = makeSheet([['Date'], [new Date('2024-06-15')]])
    const result = sheetToMarkdown(ws)
    expect(result).toContain('2024-06-15')
  })

  test('formats booleans as TRUE/FALSE', () => {
    const ws = makeSheet([['Flag'], [true], [false]])
    const result = sheetToMarkdown(ws)
    expect(result).toContain('TRUE')
    expect(result).toContain('FALSE')
  })

  test('escapes pipe characters in cell values', () => {
    const ws = makeSheet([['Col'], ['a|b']])
    const result = sheetToMarkdown(ws)
    expect(result).toContain('a\\|b')
  })

  test('trims trailing empty columns by default', () => {
    const ws = makeSheet([
      ['A', 'B', null],
      ['1', '2', null],
    ])
    const result = sheetToMarkdown(ws)
    const headerLine = result.split('\n')[0]
    // "| A | B |" → 2 cells, not 3
    const cells = headerLine.split('|').slice(1, -1).map((c) => c.trim()).filter(Boolean)
    expect(cells).toEqual(['A', 'B'])
  })

  test('keeps all columns when trimEmptyRight is false', () => {
    const ws = makeSheet([
      ['A', 'B', null],
      ['1', '2', null],
    ])
    const withTrim = sheetToMarkdown(ws, { trimEmptyRight: true })
    const withoutTrim = sheetToMarkdown(ws, { trimEmptyRight: false })
    // without trim should have more columns
    expect(withoutTrim.split('|').length).toBeGreaterThanOrEqual(withTrim.split('|').length)
  })

  test('handles rich text objects', () => {
    const ws = makeSheet([['Col'], [{ richText: [{ text: 'bold' }, { text: ' text' }] }]])
    const result = sheetToMarkdown(ws)
    expect(result).toContain('bold text')
  })

  test('handles hyperlink-style objects with .text property', () => {
    const ws = makeSheet([['Link'], [{ text: 'Click here', hyperlink: 'https://example.com' }]])
    const result = sheetToMarkdown(ws)
    expect(result).toContain('Click here')
  })

  test('renders NaN/Infinity numbers as empty', () => {
    const ws = makeSheet([['Val'], [Infinity], [NaN]])
    const result = sheetToMarkdown(ws)
    // non-finite numbers should produce empty cells
    const dataRows = result.split('\n').slice(2)
    for (const row of dataRows) {
      const cells = row.split('|').slice(1, -1).map((c) => c.trim())
      expect(cells[0]).toBe('')
    }
  })
})

// ---- exceljsExtractor via sheetToMarkdown integration ----

describe('exceljsExtractor', () => {
  test('produces markdown from a real .xlsx buffer', async () => {
    const { exceljsExtractor } = await import('@/lib/textextraction/excel')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Data')
    ws.addRow(['Product', 'Price'])
    ws.addRow(['Widget', 9.99])
    ws.addRow(['Gadget', 24.99])
    const buf = Buffer.from(await wb.xlsx.writeBuffer())

    const result = await exceljsExtractor(buf)
    expect(result).toContain('## Data')
    expect(result).toContain('Product')
    expect(result).toContain('Widget')
    expect(result).toContain('9.99')
  })

  test('returns empty string for workbook with empty sheets', async () => {
    const { exceljsExtractor } = await import('@/lib/textextraction/excel')
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Empty')
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    expect(await exceljsExtractor(buf)).toBe('')
  })
})

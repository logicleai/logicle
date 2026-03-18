import { describe, expect, test } from 'vitest'
import { xlsxExtractor } from '@/lib/textextraction/xlsx'
import * as XLSX from 'xlsx'

function makeXlsxBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, data] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), name)
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

describe('xlsxExtractor', () => {
  test('returns empty string for a workbook with only empty sheets', async () => {
    // An empty sheet has no !ref, so sheetToMarkdown returns ''
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, {} as XLSX.WorkSheet, 'Empty')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    expect(await xlsxExtractor(buf)).toBe('')
  })

  test('extracts header and data row as markdown table', async () => {
    const buf = makeXlsxBuffer({
      Sheet1: [
        ['Name', 'Age'],
        ['Alice', 30],
        ['Bob', 25],
      ],
    })
    const result = await xlsxExtractor(buf)
    expect(result).toContain('| Name | Age |')
    expect(result).toContain('Alice')
    expect(result).toContain('30')
  })

  test('right-aligns numeric columns', async () => {
    const buf = makeXlsxBuffer({
      Data: [
        ['Label', 'Value'],
        ['a', 100],
        ['b', 200],
        ['c', 300],
      ],
    })
    const result = await xlsxExtractor(buf)
    // right-align separator for a numeric column
    expect(result).toContain('---:')
  })

  test('escapes pipe characters in cell values', async () => {
    const buf = makeXlsxBuffer({
      Sheet1: [
        ['Col'],
        ['val|ue'],
      ],
    })
    const result = await xlsxExtractor(buf)
    expect(result).toContain('val\\|ue')
  })

  test('includes sheet name as heading', async () => {
    const buf = makeXlsxBuffer({
      MySheet: [['H'], ['v']],
    })
    const result = await xlsxExtractor(buf)
    expect(result).toContain('## MySheet')
  })

  test('joins multiple sheets with headings', async () => {
    const buf = makeXlsxBuffer({
      Alpha: [['A'], [1]],
      Beta: [['B'], [2]],
    })
    const result = await xlsxExtractor(buf)
    expect(result).toContain('## Alpha')
    expect(result).toContain('## Beta')
  })

  test('omits empty sheets', async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Empty')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['H'], ['v']]), 'Full')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    const result = await xlsxExtractor(buf)
    expect(result).not.toContain('## Empty')
    expect(result).toContain('## Full')
  })

  test('handles boolean cell values', async () => {
    const buf = makeXlsxBuffer({
      Sheet1: [['Flag'], [true], [false]],
    })
    const result = await xlsxExtractor(buf)
    expect(result).toContain('TRUE')
    expect(result).toContain('FALSE')
  })
})

import { TextExtractor } from '.'
import ExcelJS from 'exceljs'
import { ensureABView } from '../utils'
import { sheetToMarkdown } from './xlstomarkdown'

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

export const exceljsExtractor: TextExtractor = async (data: Buffer) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(ensureABView(data).buffer)

  const sections: string[] = []

  for (const ws of wb.worksheets) {
    let body = ''
    try {
      body = sheetToMarkdown(ws, { headerRow: 1 }) || ''
    } catch (e) {
      body = `> _Failed to parse sheet "${ws.name}": ${(e as Error).message}_`
    }

    const cleaned = trimEmptyMarkdownRows(body).trim()
    if (cleaned) {
      sections.push(`## ${ws.name}\n\n${cleaned}`)
    }
  }

  return sections.join('\n\n')
}

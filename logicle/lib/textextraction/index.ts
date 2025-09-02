import ExcelJS from 'exceljs'
import { ensureABView } from '../utils'
import { sheetToMarkdown } from './xlstomarkdown'
import micromatch from 'micromatch'
import { pdfExtractor } from './pdf'
import { wordExtractor } from './word'

export interface TextExtractionOption {
  keepImages?: boolean
}

export type TextExtractor = (buffer: Buffer, options?: TextExtractionOption) => Promise<string>

const excelExtractor: TextExtractor = async (data: Buffer) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(ensureABView(data).buffer)
  const ws = wb.worksheets[0]
  return sheetToMarkdown(ws, { headerRow: 1 })
}

const genericTextExtractor: TextExtractor = async (data: Buffer) => {
  return data.toString('utf8')
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

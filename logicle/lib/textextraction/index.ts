import micromatch from 'micromatch'
import { pdfExtractor } from './pdf'
import { wordExtractor } from './word'
import { excelExtractor } from './excel'

export interface TextExtractionOption {
  keepImages?: boolean
}

export type TextExtractor = (buffer: Buffer, options?: TextExtractionOption) => Promise<string>

const genericTextExtractor: TextExtractor = async (data: Buffer) => {
  return data.toString('utf8')
}

export const textExtractors: Record<string, TextExtractor> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': wordExtractor,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': excelExtractor,
  'application/pdf': pdfExtractor,
  'text/*': genericTextExtractor,
}

export const findExtractor = (fileType: string) => {
  return Object.entries(textExtractors).find(([_fileType, _converter]) => {
    return micromatch.isMatch(fileType, _fileType)
  })?.[1]
}

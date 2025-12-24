import micromatch from 'micromatch'
import { pdfExtractor } from './pdf'
import { wordExtractor } from './word'
import { exceljsExtractor } from './excel'
import env from '../env'
import { xlsxExtractor } from './xlsx'
import { logger } from '../logging'
import { pptxExtractor } from './pptx'

export interface TextExtractionOption {
  keepImages?: boolean
}

export type TextExtractor = (buffer: Buffer, options?: TextExtractionOption) => Promise<string>

const genericTextExtractor: TextExtractor = async (data: Buffer) => {
  return data.toString('utf8')
}

const excelExtractorSafe = async (
  data: Buffer,
  options?: TextExtractionOption
): Promise<string> => {
  const extractors = {
    xlsx: xlsxExtractor,
    exceljs: exceljsExtractor,
  } as const
  type ExtractorKey = keyof typeof extractors
  const [first, second]: [ExtractorKey, ExtractorKey] = env.textConversion.xlsx.favourExcelJs
    ? ['exceljs', 'xlsx']
    : ['xlsx', 'exceljs']
  try {
    return await extractors[first](data, options)
  } catch (e) {
    logger.error(`Failed extracting excel with ${first}, falling back to ${second}`, e)
    return await extractors[second](data, options)
  }
}

export const textExtractors: Record<string, TextExtractor> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': wordExtractor,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': excelExtractorSafe,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': pptxExtractor,
  'application/pdf': pdfExtractor,
  'text/*': genericTextExtractor,
}

export const findExtractor = (fileType: string) => {
  return Object.entries(textExtractors).find(([_fileType, _converter]) => {
    return micromatch.isMatch(fileType, _fileType)
  })?.[1]
}

import { TextExtractor } from '.'
import pdf2md from '@opendocsg/pdf2md'

export const pdfExtractor: TextExtractor = async (data: Buffer) => {
  return await pdf2md(data)
}

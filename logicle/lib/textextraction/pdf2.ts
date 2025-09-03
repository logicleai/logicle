import { TextExtractor } from '.'
import pdf2md from '@opendocsg/pdf2md'

export const pdfExtractor2: TextExtractor = async (data: Buffer) => {
  return await pdf2md(data)
}

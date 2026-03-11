import { TextExtractor } from '.'
import { pdf2mdLibpdf } from './pdf2md-libpdf'

export const pdfExtractor: TextExtractor = async (data: Buffer) => {
  return await pdf2mdLibpdf(data)
}

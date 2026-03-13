import { PDF } from '@libpdf/core'

export const pdf2mdLibpdf = async (data: Buffer): Promise<string> => {
  const pdf = await PDF.load(data)
  return pdf
    .getPages()
    .map((page) => page.extractText().text)
    .join('\n')
}

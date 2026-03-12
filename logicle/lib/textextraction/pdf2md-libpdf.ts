import { extractText, getDocumentProxy } from 'unpdf'

export const pdf2mdLibpdf = async (data: Buffer): Promise<string> => {
  const pdf = await getDocumentProxy(new Uint8Array(data))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

import PPTX2Json from 'pptx2json'
import { TextExtractor } from '.'

export const pptxExtractor: TextExtractor = async (data: Buffer) => {
  const pptx2json = new PPTX2Json()
  const json = (await pptx2json.buffer2json(data)) as Record<string, any>
  Object.entries(json).forEach(([key, value]) => {
    if (Buffer.isBuffer(value)) {
      json[key] = { type: 'buffer' }
    }
  })
  return JSON.stringify(json)
}

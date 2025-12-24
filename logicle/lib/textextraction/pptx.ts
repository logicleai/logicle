import PPTX2Json from 'pptx2json'
import { TextExtractor } from '.'
import JSZip from 'jszip'

export const pptxExtractor: TextExtractor = async (data: Buffer) => {
  const pptx2json = new PPTX2Json()
  const zip = await JSZip().loadAsync(data)
  const json = (await pptx2json.jszip2json(zip)) as Record<string, any>
  Object.entries(json).forEach(([key, value]) => {
    if (Buffer.isBuffer(value)) {
      json[key] = { type: 'buffer' }
    }
  })
  return JSON.stringify(json)
}

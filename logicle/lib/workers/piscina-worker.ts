import { findExtractor } from '../textextraction'
import { TextExtractionTask } from './pool'

export default async function run(task: TextExtractionTask): Promise<string | undefined> {
  const extractor = findExtractor(task.type)
  if (!extractor) {
    return undefined
  }
  return await extractor(Buffer.from(task.buffer))
}

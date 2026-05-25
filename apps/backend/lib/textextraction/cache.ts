import { LRUCache } from 'lru-cache'
import type { FileDbRow } from '@/backend/models/file'
import { findExtractor, genericTextExtractor } from '.'
import { storage } from '../storage'
import { ensureFileAnalysisForFile, readExtractedTextFromAnalysis } from '@/lib/file-analysis'

const cacheSizeInMb = 100

const cache = new LRUCache<string, string>({
  maxSize: Math.round(cacheSizeInMb * 1048576),
  sizeCalculation: (value) => {
    return value.length
  },
  updateAgeOnGet: false,
  ttl: 1000 * 60 * 5,
})

export const cachingExtractor = {
  extractFromFile: async (fileEntry: FileDbRow) => {
    const cached = cache.get(fileEntry.path)
    if (cached) {
      return cached
    }

    const analysis = await ensureFileAnalysisForFile(fileEntry)
    const analyzedText = await readExtractedTextFromAnalysis(fileEntry, analysis)
    if (analyzedText) {
      cache.set(fileEntry.path, analyzedText)
      return analyzedText
    }

    const isUnknownText = analysis?.status === 'ready' && analysis.payload?.kind === 'unknown' && analysis.payload.isText
    const extractor = findExtractor(fileEntry.type) ?? (isUnknownText ? genericTextExtractor : undefined)
    if (!extractor) {
      return undefined
    }
    const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
    const text = await extractor(fileContent)
    cache.set(fileEntry.path, text)
    return text
  },
}

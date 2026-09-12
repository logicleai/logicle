import { LRUCache } from 'lru-cache'
import type { FileDbRow } from '@/backend/models/file'
import { findExtractor, genericTextExtractor } from '.'
import { storage } from '../storage'
import { ensureFileAnalysisForFile, readExtractedTextFromAnalysis } from '@/lib/file-analysis'
import { logger } from '@/lib/logging'
import { ocrExtractor } from './ocr'

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

    const isUnknownText =
      analysis?.status === 'ready' &&
      analysis.payload?.kind === 'unknown' &&
      analysis.payload.isText
    const extractor =
      findExtractor(fileEntry.type) ?? (isUnknownText ? genericTextExtractor : undefined)
    if (extractor) {
      try {
        const fileContent = await storage.readBuffer(fileEntry.path, fileEntry.encryption)
        const text = await extractor(fileContent)
        if (text.trim().length > 0) {
          cache.set(fileEntry.path, text)
          return text
        }
      } catch (error) {
        logger.warn('File text extraction failed; trying OCR fallback', {
          fileId: fileEntry.id,
          fileName: fileEntry.name,
          fileType: fileEntry.type,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const ocrText = await ocrExtractor.extractFromFile(fileEntry, analysis)
    if (ocrText) {
      cache.set(fileEntry.path, ocrText)
      return ocrText
    }
    return undefined
  },
}

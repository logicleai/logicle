import { LRUCache } from 'lru-cache'
import * as schema from '@/db/schema'
import { findExtractor } from '.'
import { storage } from '../storage'

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
  extractFromFile: async (fileEntry: schema.File) => {
    const extractor = findExtractor(fileEntry.type)
    if (!extractor) {
      return undefined
    }
    const cached = cache.get(fileEntry.path)
    if (cached) {
      return cached
    }
    const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
    const text = await extractor(fileContent)
    cache.set(fileEntry.path, text)
    return text
  },
}

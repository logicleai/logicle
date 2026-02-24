import { LRUCache } from 'lru-cache'
import * as schema from '@/db/schema'
import { findExtractor, TextExtractor } from '.'
import env from '../env'
import { storage } from '../storage'
import { logger } from '../logging'
import { getTextExtractionPool, TextExtractionTask } from '../workers/pool'

const cacheSizeInMb = 100

const cache = new LRUCache<string, string>({
  maxSize: Math.round(cacheSizeInMb * 1048576),
  sizeCalculation: (value) => {
    return value.length
  },
  updateAgeOnGet: false,
  ttl: 1000 * 60 * 5,
})

type PendingExtraction = {
  promise: Promise<string | undefined>
}

const pendingExtractions = new Map<string, PendingExtraction>()
let activeExtractions = 0

type ExtractionUsageOptions = {
  usePool: boolean
}

async function runExtraction(
  fileEntry: schema.File,
  extractor: TextExtractor,
  options: ExtractionUsageOptions
): Promise<string | undefined> {
  const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  if (!options.usePool) {
    return await extractor(fileContent)
  }
  const pool = getTextExtractionPool()
  return (await pool.run({
    type: fileEntry.type,
    buffer: fileContent,
  } satisfies TextExtractionTask)) as string | undefined
}

async function startExtraction(fileEntry: schema.File): Promise<string | undefined> {
  const extractor = findExtractor(fileEntry.type)
  if (!extractor) {
    logger.debug(
      `Text extraction skipped: no extractor (path=${fileEntry.path}, mime=${fileEntry.type})`
    )
    return undefined
  }
  const cached = cache.get(fileEntry.path)
  if (cached) {
    logger.debug(
      `Text extraction cache-hit (path=${fileEntry.path}, active=${activeExtractions}, pending=${pendingExtractions.size})`
    )
    return cached
  }

  const pending = pendingExtractions.get(fileEntry.path)
  if (pending) {
    logger.debug(
      `Text extraction join-pending (path=${fileEntry.path}, active=${activeExtractions}, pending=${pendingExtractions.size})`
    )
    return await pending.promise
  }

  const startedAt = Date.now()
  activeExtractions += 1
  logger.debug(
    `Text extraction start (path=${fileEntry.path}, usePool=${
      env.textExtraction.useThreadPool
    }, active=${activeExtractions}, pending=${pendingExtractions.size + 1})`
  )

  const extraction = (async () => {
    try {
      const text = await runExtraction(fileEntry, extractor, {
        usePool: env.textExtraction.useThreadPool,
      })
      if (text) {
        cache.set(fileEntry.path, text)
      }
      return text
    } catch (e) {
      logger.error(`Text extraction failed (path=${fileEntry.path})`, e)
      throw e
    }
  })()

  pendingExtractions.set(fileEntry.path, { promise: extraction })
  try {
    return await extraction
  } finally {
    pendingExtractions.delete(fileEntry.path)
    const elapsedMs = Date.now() - startedAt
    activeExtractions -= 1
    logger.info(
      `Text extraction end (path=${fileEntry.path}, elapsedMs=${elapsedMs}, active=${activeExtractions}, pending=${pendingExtractions.size})`
    )
  }
}

export const cachingExtractor = {
  extractFromFile: async (fileEntry: schema.File) => {
    return await startExtraction(fileEntry)
  },
  warmupFile: (fileEntry: schema.File) => {
    void startExtraction(fileEntry).catch((e) => {
      logger.error(`Warmup text extraction failed for ${fileEntry.path}`, e)
    })
    return undefined
  },
}

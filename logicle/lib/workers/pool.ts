import fs from 'node:fs'
import path from 'node:path'
import Piscina from 'piscina'
import { logger } from '../logging'
import env from '../env'

export interface TextExtractionTask {
  type: string
  buffer: Uint8Array
}

let pool: Piscina | undefined
let shutdownHooksInstalled = false

function poolConfig() {
  const minThreads = env.workerPool.minThreads
  const maxThreads = env.workerPool.maxThreads
  const maxQueue = env.workerPool.maxQueue
  return { minThreads, maxThreads: Math.max(maxThreads, minThreads), maxQueue }
}

function resolveWorkerFile() {
  if (process.env.NODE_ENV !== 'production') {
    // In dev, always run the source worker through tsx to avoid stale dist artifacts.
    const sourceWorker = path.resolve(process.cwd(), 'lib/workers/piscina-worker.ts')
    return { filename: sourceWorker, execArgv: ['--import=tsx'] }
  }
  const distWorker = path.resolve(process.cwd(), 'dist-server/worker-pool.js')
  if (fs.existsSync(distWorker)) {
    return { filename: distWorker, execArgv: [] as string[] }
  }
  // Production fallback for environments without dist-server worker.
  const sourceWorker = path.resolve(process.cwd(), 'lib/workers/piscina-worker.ts')
  return { filename: sourceWorker, execArgv: ['--import=tsx'] }
}

function installShutdownHooks() {
  if (shutdownHooksInstalled) return
  shutdownHooksInstalled = true
  const close = async () => {
    if (!pool) return
    const current = pool
    pool = undefined
    try {
      await current.destroy()
    } catch (e) {
      logger.error('Failed closing text extraction pool', e)
    }
  }
  process.once('SIGTERM', () => {
    void close()
  })
  process.once('SIGINT', () => {
    void close()
  })
}

export function getTextExtractionPool() {
  if (pool) {
    return pool
  }
  const { filename, execArgv } = resolveWorkerFile()
  const { minThreads, maxThreads, maxQueue } = poolConfig()
  pool = new Piscina({
    filename,
    execArgv,
    minThreads,
    maxThreads,
    maxQueue,
  })
  installShutdownHooks()
  logger.info(
    `Text extraction pool initialized (minThreads=${minThreads}, maxThreads=${maxThreads}, maxQueue=${maxQueue})`
  )
  return pool
}

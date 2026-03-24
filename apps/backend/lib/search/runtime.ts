import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

function resolveScriptPath(isDev: boolean): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))

  if (!isDev) {
    return path.join(currentDir, 'search-script.js')
  }

  const candidates = [
    path.join(currentDir, 'script.ts'),
    path.resolve(process.cwd(), 'apps/backend/lib/search/script.ts'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  throw new Error(`Unable to locate search worker script. Tried: ${candidates.join(', ')}`)
}

export function startSearchWorker() {
  const isDev = process.env.NODE_ENV !== 'production'
  const scriptPath = resolveScriptPath(isDev)
  const execArgv = isDev ? ['--import', 'tsx'] : []

  console.info('[search] Starting sync worker', { isDev, scriptPath })

  const worker = new Worker(scriptPath, { execArgv, name: 'search-sync' })

  worker.on('error', (err) => {
    console.error('[search] Worker error', { error: err.message })
  })

  worker.on('exit', (code) => {
    if (code !== 0) console.error('[search] Worker exited unexpectedly', { code })
  })

  return worker
}

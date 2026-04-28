import { parentPort } from 'worker_threads'
import { getEncoding, type Tiktoken } from 'js-tiktoken'

if (!parentPort) throw new Error('tokenizer worker script must run inside a Worker thread')

const encodingCache = new Map<'cl100k_base' | 'o200k_base', Tiktoken>()

const getEncodingCached = (name: 'cl100k_base' | 'o200k_base'): Tiktoken => {
  const cached = encodingCache.get(name)
  if (cached) return cached
  const encoding = getEncoding(name)
  encodingCache.set(name, encoding)
  return encoding
}

parentPort.on(
  'message',
  (msg: { id: number; tokenizer: 'cl100k_base' | 'o200k_base'; text: string }) => {
    try {
      const count = getEncodingCached(msg.tokenizer).encode(msg.text).length
      parentPort!.postMessage({ id: msg.id, ok: true, count })
    } catch (error) {
      parentPort!.postMessage({
        id: msg.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
)

import { parentPort } from 'worker_threads'
import { analyzeFileBuffer } from '../analyzers'

if (!parentPort) throw new Error('worker/script must run inside a Worker thread')

const log = (level: 'info' | 'warn' | 'error', message: string, meta?: object) =>
  parentPort!.postMessage({ type: 'log', level, message, ...meta })

parentPort.on('message', async (msg: { id: number; buffer: Buffer; mimeType: string }) => {
  try {
    const payload = await analyzeFileBuffer(Buffer.from(msg.buffer), msg.mimeType)
    log('info', 'File analyzed', { mimeType: msg.mimeType, kind: payload.kind })
    parentPort!.postMessage({ id: msg.id, ok: true, payload })
  } catch (error) {
    log('error', 'File analysis failed', {
      mimeType: msg.mimeType,
      error: error instanceof Error ? error.message : String(error),
    })
    parentPort!.postMessage({
      id: msg.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

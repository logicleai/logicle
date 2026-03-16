import { parentPort } from 'worker_threads'
import { analyzeFileBuffer } from '../analyzers'

if (!parentPort) throw new Error('worker/script must run inside a Worker thread')

parentPort.on('message', async (msg: { id: number; buffer: Buffer; mimeType: string }) => {
  try {
    const payload = await analyzeFileBuffer(Buffer.from(msg.buffer), msg.mimeType)
    parentPort!.postMessage({ id: msg.id, ok: true, payload })
  } catch (error) {
    parentPort!.postMessage({
      id: msg.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

import { parentPort } from 'worker_threads'
import * as openpgp from 'openpgp'
import { patchSkeskPackets } from './streaming-s2k.ts'

if (!parentPort) throw new Error('pgp-s2k worker script must run inside a Worker thread')

type Request = { id: number; headerBytes: number[]; passphrase: string }

parentPort.on('message', async (msg: Request) => {
  try {
    // Feed a non-closing ReadableStream rather than a plain Uint8Array.
    // A truncated Uint8Array would make readMessage throw "Unexpected end of packet"
    // when it sees the SEIPD body length (107 MB) but only has a few hundred bytes.
    // A stream that enqueues the header bytes and then never closes lets readMessage
    // return as soon as it has parsed the SKESK packet (~50 bytes) and the SEIPD
    // packet header (~5 bytes) without waiting for the bulk ciphertext.
    const bytes = new Uint8Array(msg.headerBytes)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        // Intentionally do NOT close — the stream stays open to simulate an
        // ongoing PGP message whose SEIPD body has not arrived yet.
      },
    })
    const message = await openpgp.readMessage({ binaryMessage: stream })
    patchSkeskPackets(message)
    const [sk] = await openpgp.decryptSessionKeys({ message, passwords: [msg.passphrase] })
    parentPort!.postMessage({
      id: msg.id,
      ok: true,
      algorithm: sk.algorithm,
      data: Array.from(sk.data),
    })
  } catch (e) {
    console.error('[pgp-s2k-worker] Request failed', {
      id: msg.id,
      error: e instanceof Error ? e.message : String(e),
    })
    parentPort!.postMessage({
      id: msg.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    })
  }
})

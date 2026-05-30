import { parentPort } from 'worker_threads'
import * as openpgp from 'openpgp'
import { streamingIteratedS2kProduceKey } from './streaming-s2k'

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

    // Replace the GenericS2K produceKey on every iterated SKESK packet with
    // the streaming implementation, which hashes the repeated salt||passphrase
    // block in 64 KB chunks instead of materialising up to ~65 MB at once.
    // All other openpgp machinery (CFB session-key unwrap, AEAD, etc.) is unchanged.
    for (const pkt of message.packets.filterByTag(openpgp.enums.packet.symEncryptedSessionKey)) {
      const s2k = (pkt as any).s2k
      if (s2k?.type === 'iterated') {
        const { algorithm, salt, c } = s2k
        s2k.produceKey = (passphrase: string, keySizeBytes: number): Promise<Uint8Array> =>
          Promise.resolve(streamingIteratedS2kProduceKey(algorithm, salt, c, passphrase, keySizeBytes))
      }
    }

    const [sk] = await openpgp.decryptSessionKeys({ message, passwords: [msg.passphrase] })
    parentPort!.postMessage({
      id: msg.id,
      ok: true,
      algorithm: sk.algorithm,
      data: Array.from(sk.data),
    })
  } catch (e) {
    parentPort!.postMessage({
      id: msg.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    })
  }
})

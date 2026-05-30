import { createHash } from 'node:crypto'
import * as openpgp from 'openpgp'

/**
 * Maps OpenPGP hash enum bytes (RFC 4880 §9.4) to Node.js crypto names.
 */
const HASH_NAMES: Readonly<Record<number, string>> = {
  1: 'md5',
  2: 'sha1',
  3: 'ripemd160',
  8: 'sha256',
  9: 'sha384',
  10: 'sha512',
  11: 'sha224',
  12: 'sha3-256',
  14: 'sha3-512',
}

/**
 * Maximum bytes fed to the hash per update() call.
 *
 * We build a reusable chunk of `floor(CHUNK_BYTES / block.length)` copies of
 * `block`, so the repeating boundary never falls mid-chunk and the total bytes
 * fed matches the reference implementation exactly.
 */
const CHUNK_BYTES = 65_536

/**
 * Produce an OpenPGP Generic Iterated S2K derived key without materialising
 * the full `count`-byte buffer in memory.
 *
 * Equivalent to OpenPGP.js `GenericS2K.produceKey` for the `iterated` type,
 * but hashes the repeated `salt || passphrase` block in 64 KB streaming
 * chunks instead of allocating a single buffer of up to ~65 MB.
 *
 * Algorithm (RFC 4880 §3.7.1.3):
 *   count  = max((16 + (C & 15)) << ((C >> 4) + 6),  block.length)
 *   block  = salt || passphraseBytes
 *   round k: SHA(0x00×k || block repeated up to count bytes) → digestK
 *   key    = concat(digest0, digest1, …)[0 : keySizeBytes]
 *
 * @param hashAlgoByte  OpenPGP hash enum byte stored in GenericS2K.algorithm
 * @param salt          8-byte salt stored in GenericS2K.salt
 * @param encodedCount  1-byte encoded count stored in GenericS2K.c
 * @param passphrase    Passphrase string (UTF-8 encoded internally)
 * @param keySizeBytes  Desired key length in bytes
 */
export function streamingIteratedS2kProduceKey(
  hashAlgoByte: number,
  salt: Uint8Array,
  encodedCount: number,
  passphrase: string,
  keySizeBytes: number,
): Uint8Array {
  const hashName = HASH_NAMES[hashAlgoByte]
  if (!hashName) throw new Error(`Unsupported OpenPGP hash algorithm byte: ${hashAlgoByte}`)

  const passphraseBytes = Buffer.from(passphrase, 'utf8')
  const block = Buffer.concat([Buffer.from(salt), passphraseBytes])

  if (block.length === 0) throw new Error('S2K block is empty — salt must be present')

  const decodedCount = (16 + (encodedCount & 15)) << ((encodedCount >> 4) + 6)
  const count = Math.max(decodedCount, block.length)

  // Build a reusable chunk: an exact multiple of block.length, up to CHUNK_BYTES.
  // Because the chunk length is a multiple of block.length, `chunk[0..remaining-1]`
  // always contains the correct repeating-pattern suffix when `count` is not a
  // multiple of chunk.length.
  const repeats = Math.max(1, Math.floor(CHUNK_BYTES / block.length))
  const chunk = Buffer.allocUnsafe(repeats * block.length)
  for (let i = 0; i < repeats; i++) chunk.set(block, i * block.length)
  const chunkLen = chunk.length

  const digests: Buffer[] = []
  let totalBytes = 0
  let prefixLen = 0 // number of leading zero bytes for digest round k

  while (totalBytes < keySizeBytes) {
    const h = createHash(hashName)
    if (prefixLen > 0) h.update(Buffer.alloc(prefixLen))

    let fed = 0
    while (fed < count) {
      const remaining = count - fed
      if (remaining >= chunkLen) {
        h.update(chunk)
        fed += chunkLen
      } else {
        h.update(chunk.subarray(0, remaining))
        fed = count
      }
    }

    const digest = h.digest()
    digests.push(digest)
    totalBytes += digest.length
    prefixLen++
  }

  return Buffer.concat(digests).subarray(0, keySizeBytes)
}

/**
 * Patch every iterated SKESK packet in `message` so that its `s2k.produceKey`
 * calls `streamingIteratedS2kProduceKey` instead of the default OpenPGP.js
 * implementation.  All other openpgp machinery (CFB session-key unwrap, AEAD,
 * output formatting) is left unchanged.
 */
export function patchSkeskPackets(message: openpgp.Message<Uint8Array>): void {
  for (const pkt of message.packets.filterByTag(openpgp.enums.packet.symEncryptedSessionKey)) {
    const s2k = (pkt as any).s2k
    if (s2k?.type === 'iterated') {
      const { algorithm, salt, c } = s2k
      s2k.produceKey = (passphrase: string, keySizeBytes: number): Promise<Uint8Array> =>
        Promise.resolve(streamingIteratedS2kProduceKey(algorithm, salt, c, passphrase, keySizeBytes))
    }
  }
}

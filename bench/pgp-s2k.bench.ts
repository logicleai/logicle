/**
 * OpenPGP S2K Key Derivation Benchmark
 *
 * Compares OpenPGP.js GenericS2K (reference) with a streaming implementation
 * that hashes the repeated salt||passphrase block without materialising the
 * full count-bytes buffer in memory.
 *
 * Run: pnpm bench:pgp-s2k
 */

import * as openpgp from 'openpgp'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

// ─── Types ────────────────────────────────────────────────────────────────────

type S2kBenchmarkCase = {
  name: string
  hashAlgorithmByte: number // OpenPGP hash enum byte (8=sha256, 10=sha512)
  hashAlgorithmName: string // Node.js crypto name
  salt: Uint8Array // always 8 bytes for iterated S2K
  encodedCount: number // the 1-byte encoded count (C in RFC 4880)
  passphrase: string
  keySizeBytes: number
}

type Stats = {
  mean: number
  median: number
  p95: number
  p99: number
  min: number
  max: number
  opsSec: number
  rssBefore: number
  rssAfter: number
  heapBefore: number
  heapAfter: number
}

// ─── Reference: OpenPGP.js GenericS2K ────────────────────────────────────────

/**
 * Build a GenericS2K instance by parsing a synthetic version-4 SKESK payload.
 *
 * Layout of a v4 SKESK (RFC 4880 §5.3):
 *   [version=4] [symAlgo] [s2kType=3] [hashAlgo] [salt×8] [countByte]
 *
 * `SymEncryptedSessionKeyPacket.read()` initialises `this.s2k` from these
 * bytes; we then call `s2k.produceKey()` directly.
 */
function makeOpenpgpS2k(
  hashAlgoByte: number,
  salt: Uint8Array,
  encodedCount: number,
): /* GenericS2K */ any {
  const pkt = new openpgp.SymEncryptedSessionKeyPacket() as any
  const bytes = new Uint8Array([
    4, // version 4
    9, // aes256 — arbitrary, does not affect key derivation
    3, // iterated S2K (enums.s2k.iterated)
    hashAlgoByte,
    ...salt,
    encodedCount,
  ])
  pkt.read(bytes)
  return pkt.s2k
}

async function openpgpS2kProduceKey(bc: S2kBenchmarkCase): Promise<Uint8Array> {
  const s2k = makeOpenpgpS2k(bc.hashAlgorithmByte, bc.salt, bc.encodedCount)
  return (s2k.produceKey(bc.passphrase, bc.keySizeBytes) as Promise<Uint8Array>)
}

// ─── Streaming Implementation ─────────────────────────────────────────────────

/**
 * Maximum bytes fed to the hash per update() call.
 *
 * We build a reusable chunk of exactly `floor(MAX_CHUNK / block.length)`
 * copies of `block`.  This reduces the number of update() calls without
 * materialising the full `count`-byte buffer.
 */
const STREAMING_CHUNK_BYTES = 65_536

/**
 * Produce the same derived key as OpenPGP.js GenericS2K (iterated type)
 * without allocating a buffer of `count` bytes.
 *
 * Algorithm (RFC 4880 §3.7.1.3):
 *   count  = max((16 + (C & 15)) << ((C >> 4) + 6),  block.length)
 *   block  = salt || passphraseBytes
 *   round k: SHA(0x00×k || block repeated up to count bytes) → digestK
 *   key    = concat(digest0, digest1, …)[0 : keySizeBytes]
 */
function streamingS2kProduceKey(bc: S2kBenchmarkCase): Uint8Array {
  const passphraseBytes = Buffer.from(bc.passphrase, 'utf8')
  const block = Buffer.concat([Buffer.from(bc.salt), passphraseBytes])

  if (block.length === 0) {
    throw new Error('S2K block is empty (salt must be 8 bytes)')
  }

  const decodedCount = (16 + (bc.encodedCount & 15)) << ((bc.encodedCount >> 4) + 6)
  const count = Math.max(decodedCount, block.length)

  // Build a chunk: exact multiple of block.length, capped at STREAMING_CHUNK_BYTES.
  // Because the chunk is an exact multiple of block.length, the repeating
  // pattern is preserved at chunk boundaries — so `chunk[0..remaining-1]`
  // always gives the correct suffix when the last chunk is partial.
  const chunkRepeats = Math.max(1, Math.floor(STREAMING_CHUNK_BYTES / block.length))
  const chunkBuf = Buffer.allocUnsafe(chunkRepeats * block.length)
  for (let i = 0; i < chunkRepeats; i++) chunkBuf.set(block, i * block.length)
  const chunkLen = chunkBuf.length

  const digests: Buffer[] = []
  let totalBytes = 0
  let prefixLen = 0 // zero-byte prefix for round k

  while (totalBytes < bc.keySizeBytes) {
    const h = createHash(bc.hashAlgorithmName)

    // Prefix zeros distinguish digest rounds (OpenPGP multi-round convention).
    if (prefixLen > 0) h.update(Buffer.alloc(prefixLen))

    // Feed block repeated to satisfy count bytes — no large allocation.
    let fed = 0
    while (fed < count) {
      const remaining = count - fed
      if (remaining >= chunkLen) {
        h.update(chunkBuf)
        fed += chunkLen
      } else {
        h.update(chunkBuf.subarray(0, remaining))
        fed = count
      }
    }

    const digest = h.digest()
    digests.push(digest)
    totalBytes += digest.length
    prefixLen++
  }

  return Buffer.concat(digests).subarray(0, bc.keySizeBytes)
}

// ─── Measurement ──────────────────────────────────────────────────────────────

async function measure(
  fn: () => unknown,
  warmupIter: number,
  measuredIter: number,
): Promise<Stats> {
  for (let i = 0; i < warmupIter; i++) await fn()

  const times: number[] = []
  const mem0 = process.memoryUsage()

  for (let i = 0; i < measuredIter; i++) {
    const t0 = performance.now()
    await fn()
    times.push(performance.now() - t0)
  }

  const mem1 = process.memoryUsage()
  times.sort((a, b) => a - b)

  const sum = times.reduce((a, b) => a + b, 0)
  const mean = sum / times.length

  const idx = (pct: number) => Math.min(times.length - 1, Math.floor(times.length * pct))

  return {
    mean,
    median: times[idx(0.5)],
    p95: times[idx(0.95)],
    p99: times[idx(0.99)],
    min: times[0],
    max: times[times.length - 1],
    opsSec: 1000 / mean,
    rssBefore: mem0.rss,
    rssAfter: mem1.rss,
    heapBefore: mem0.heapUsed,
    heapAfter: mem1.heapUsed,
  }
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms >= 1) return `${ms.toFixed(2)}ms`
  return `${(ms * 1000).toFixed(0)}µs`
}

function fmtBytes(b: number): string {
  if (Math.abs(b) >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}MB`
  if (Math.abs(b) >= 1024) return `${(b / 1024).toFixed(0)}KB`
  return `${b}B`
}

function printStats(label: string, s: Stats): void {
  const heapDelta = s.heapAfter - s.heapBefore
  const rssDelta = s.rssAfter - s.rssBefore
  console.log(
    `  ${label.padEnd(22)}` +
      `  mean=${fmtMs(s.mean).padStart(9)}` +
      `  p50=${fmtMs(s.median).padStart(9)}` +
      `  p95=${fmtMs(s.p95).padStart(9)}` +
      `  p99=${fmtMs(s.p99).padStart(9)}` +
      `  min=${fmtMs(s.min).padStart(9)}` +
      `  max=${fmtMs(s.max).padStart(9)}` +
      `  ops/s=${s.opsSec.toFixed(2).padStart(8)}` +
      `  heap=${fmtBytes(heapDelta).padStart(8)}` +
      `  rss=${fmtBytes(rssDelta).padStart(8)}`,
  )
}

// ─── Case generation ──────────────────────────────────────────────────────────

// Fixed 8-byte salt — reproducible across runs
const FIXED_SALT = new Uint8Array([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef])

const COUNT_BYTES = [96, 160, 208, 224, 255] as const

const KEY_SIZES = [16, 24, 32, 64] as const

const PASSPHRASES = [
  { label: 'empty', value: '' },
  { label: 'short-ascii', value: 'hello' },
  {
    label: 'long-ascii',
    value: 'this is a much longer passphrase for benchmarking S2K key derivation performance',
  },
  { label: 'non-ascii', value: 'pässwörð🔑' },
] as const

// Production default according to openpgp config: sha256 (byte=8)
const HASH_ALGOS = [
  { byte: 8, name: 'sha256' },
  { byte: 10, name: 'sha512' },
] as const

function buildCases(): S2kBenchmarkCase[] {
  const cases: S2kBenchmarkCase[] = []
  const seen = new Set<string>()

  function add(c: S2kBenchmarkCase) {
    if (!seen.has(c.name)) {
      seen.add(c.name)
      cases.push(c)
    }
  }

  // Section 1: all count bytes × all key sizes, sha256, short passphrase
  // Answers: "how does cost scale with count byte and key size?"
  for (const c of COUNT_BYTES) {
    for (const k of KEY_SIZES) {
      add({
        name: `sha256/count=${c}/key=${k}B/short-ascii`,
        hashAlgorithmByte: 8,
        hashAlgorithmName: 'sha256',
        salt: FIXED_SALT,
        encodedCount: c,
        passphrase: 'hello',
        keySizeBytes: k,
      })
    }
  }

  // Section 2: passphrase variety at production defaults (sha256, count=224, key=32B)
  // Answers: "does passphrase size/encoding matter?"
  for (const pp of PASSPHRASES) {
    add({
      name: `sha256/count=224/key=32B/${pp.label}`,
      hashAlgorithmByte: 8,
      hashAlgorithmName: 'sha256',
      salt: FIXED_SALT,
      encodedCount: 224,
      passphrase: pp.value,
      keySizeBytes: 32,
    })
  }

  // Section 3: sha512 at production count and key size
  // Answers: "does hash algorithm choice matter?"
  for (const h of HASH_ALGOS) {
    add({
      name: `${h.name}/count=224/key=32B/short-ascii`,
      hashAlgorithmByte: h.byte,
      hashAlgorithmName: h.name,
      salt: FIXED_SALT,
      encodedCount: 224,
      passphrase: 'hello',
      keySizeBytes: 32,
    })
  }

  return cases
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const LINE = '═'.repeat(110)
  console.log(LINE)
  console.log('OpenPGP S2K Key Derivation Benchmark')
  console.log('Implementations: openpgp@6.1.1 GenericS2K (reference)  vs  streaming (no full-buffer alloc)')
  console.log(LINE)
  console.log()

  const cases = buildCases()
  let allPassed = true

  for (const bc of cases) {
    process.stdout.write(`▶ ${bc.name} … correctness … `)

    // Correctness check — must pass before timing runs
    let refKey: Uint8Array
    let streamKey: Uint8Array
    try {
      refKey = await openpgpS2kProduceKey(bc)
      streamKey = streamingS2kProduceKey(bc)
      assert.deepStrictEqual(
        new Uint8Array(streamKey),
        new Uint8Array(refKey),
        `Key mismatch for case: ${bc.name}`,
      )
      process.stdout.write(`✓  key=${bc.keySizeBytes}B ref[0..3]=${Array.from(refKey.subarray(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('')}\n`)
    } catch (e) {
      process.stdout.write(`✗ FAIL\n`)
      console.error('  ', e)
      allPassed = false
      continue
    }

    // Adaptive iteration counts: fewer iterations for expensive (high count-byte) cases
    const warmup = bc.encodedCount >= 224 ? 3 : bc.encodedCount >= 160 ? 5 : 10
    const iters = bc.encodedCount >= 224 ? 15 : bc.encodedCount >= 160 ? 25 : 50

    const refStats = await measure(() => openpgpS2kProduceKey(bc), warmup, iters)
    const streamStats = await measure(() => streamingS2kProduceKey(bc), warmup, iters)

    printStats('openpgp (ref):', refStats)
    printStats('streaming:', streamStats)

    const speedup = refStats.mean / streamStats.mean
    const heapAdvantage = (refStats.heapAfter - refStats.heapBefore) - (streamStats.heapAfter - streamStats.heapBefore)
    const faster = speedup > 1 ? `${speedup.toFixed(2)}x faster` : `${(1 / speedup).toFixed(2)}x slower`
    console.log(`  ↳ streaming is ${faster}  heap advantage=${fmtBytes(heapAdvantage)}`)
    console.log()
  }

  console.log(LINE)
  if (allPassed) {
    console.log('All correctness checks passed.')
  } else {
    console.log('⚠️  Some correctness checks FAILED — see above.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

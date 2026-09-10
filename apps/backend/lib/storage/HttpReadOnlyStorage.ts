import { BaseStorage } from './api'
import type { StorageEncryption, StorageReadOptions } from './api'

/**
 * Read-only object storage reached over HTTP(S).
 *
 * The offline replay bundle builder uses this when the source tenant's object store is not
 * directly reachable (production buckets are IP-locked to the tenant VMs). An operator stands up a
 * narrow read-only proxy that runs where the bucket is reachable — see
 * `cli/download_replay_bundle` in the ops repo — and points `FILE_STORAGE_LOCATION` at it.
 *
 * The proxy is expected to map an appended object path to its upstream storage and return the
 * bytes verbatim (still encrypted at rest, if the tenant encrypts — the encrypting wrappers around
 * this storage decrypt locally). Writes and deletes are impossible by construction, so pointing an
 * evaluator at this backend cannot mutate the tenant's files.
 */
export class HttpReadOnlyStorage extends BaseStorage {
  private readonly baseUrl: URL

  constructor(
    baseUrl: string,
    private readonly authorization?: string
  ) {
    super()
    this.baseUrl = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
    if (this.baseUrl.username || this.baseUrl.password) {
      throw new Error('File storage proxy URLs must not embed credentials')
    }
  }

  private urlFor(path: string): URL {
    // Encode one segment at a time so a blob path keeps its hierarchy but cannot escape the
    // configured proxy prefix through `..`, a query string, or a fragment.
    const segments = path.split('/').filter(Boolean)
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new Error('File storage proxy path contains a traversal segment')
    }
    const encoded = segments.map((segment) => encodeURIComponent(segment)).join('/')
    if (!encoded) throw new Error('File storage proxy path is empty')
    return new URL(encoded, this.baseUrl)
  }

  supportsRangeReads(_encryption: StorageEncryption): boolean {
    return true
  }

  async readStream(
    path: string,
    _encryption: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const headers = new Headers()
    if (this.authorization) headers.set('authorization', this.authorization)
    let expectedRange: { start: number; end: number } | undefined
    if (options?.rangeStart !== undefined || options?.rangeEnd !== undefined) {
      if (options.rangeStart === undefined || options.rangeEnd === undefined) {
        throw new Error('File storage proxy reads require both rangeStart and rangeEnd')
      }
      headers.set('range', `bytes=${options.rangeStart}-${options.rangeEnd}`)
      expectedRange = { start: options.rangeStart, end: options.rangeEnd }
    }
    const response = await fetch(this.urlFor(path), {
      headers,
      signal: options?.signal,
      // Never follow a redirect that could forward the proxy credential to another host.
      redirect: 'error',
    })
    if (!response.ok || !response.body) {
      throw new Error(`File storage proxy read failed for ${path}: HTTP ${response.status}`)
    }
    if (expectedRange && response.status !== 206) {
      throw new Error(
        `File storage proxy ignored the byte range for ${path}: expected HTTP 206, got ${response.status}`
      )
    }
    if (expectedRange) {
      const contentRange = response.headers.get('content-range')
      const match = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/)
      const returnedEnd = Number(match?.[2])
      const totalSize = match?.[3] === '*' ? undefined : Number(match?.[3])
      const endedAtEof = totalSize !== undefined && returnedEnd === totalSize - 1
      if (
        !match ||
        Number(match[1]) !== expectedRange.start ||
        returnedEnd > expectedRange.end ||
        (returnedEnd !== expectedRange.end && !endedAtEof)
      ) {
        throw new Error(
          `File storage proxy returned an invalid Content-Range for ${path}: ${
            contentRange ?? 'missing'
          }`
        )
      }
    }
    return response.body
  }

  async writeStream(): Promise<void> {
    throw new Error('HTTP file storage proxy is read-only; write is not permitted')
  }

  async rm(): Promise<void> {
    throw new Error('HTTP file storage proxy is read-only; delete is not permitted')
  }
}

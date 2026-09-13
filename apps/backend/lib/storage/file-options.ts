import type { StorageReadOptions } from './api'

/** Supplies DB facts that make a complete storage read verifiable. */
export const fileReadOptions = (file: {
  size?: number | null
  contentHash?: string | null
}): StorageReadOptions => ({
  ...(typeof file.size === 'number' ? { expectedSizeBytes: file.size } : {}),
  ...(file.contentHash ? { expectedContentHash: file.contentHash } : {}),
})

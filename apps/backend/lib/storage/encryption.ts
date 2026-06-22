import env from '@/lib/env'
import type { StorageEncryption } from './api'

export const fileEncryptionIds = {
  pgp: 'pgp',
  aead: 'aead',
} as const

export type StoredFileEncryption =
  (typeof fileEncryptionIds)[keyof typeof fileEncryptionIds]

export function getConfiguredFileEncryption(): StoredFileEncryption | null {
  if (!env.fileStorage.encryptFiles) return null
  switch (env.fileStorage.encryptionProvider) {
    case 'aead':
      return fileEncryptionIds.aead
    case 'pgp':
    default:
      return fileEncryptionIds.pgp
  }
}

export function isFileEncrypted(encryption: StorageEncryption): boolean {
  return encryption !== null
}

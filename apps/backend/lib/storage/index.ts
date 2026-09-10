import env from '@/lib/env'
import { Storage } from './api'
import { CachingStorage } from './CachingStorage'
import { AeadEncryptingStorage } from '../../ee/AeadEncryptingStorage'
import { DbBlobStorage } from './DbBlobStorage'
import { FsStorage } from './FsStorage'
import { HttpReadOnlyStorage } from './HttpReadOnlyStorage'
import { S3Storage } from './S3Storage'
import { PgpEncryptingStorage } from '../../ee/PgpEncryptingStorage'

function createBasicStorage(location: string) {
  if (location.startsWith('s3://')) {
    // Parse S3 location
    const bucket = location.substring(5)
    if (!bucket) {
      throw new Error('Invalid S3 URL. Must be in the format s3://bucket')
    }
    return new S3Storage(bucket)
  } else if (location === 'replaydb:') {
    // Offline compression-replay evaluator only: bytes come from the replay database itself.
    return new DbBlobStorage()
  } else if (location.startsWith('http://') || location.startsWith('https://')) {
    // Replay bundle builder only: a narrow read-only proxy in front of an otherwise unreachable
    // object store (see cli/download_replay_bundle in the ops repo).
    return new HttpReadOnlyStorage(location, process.env.FILE_STORAGE_PROXY_AUTHORIZATION)
  } else {
    return new FsStorage(location)
  }
}

async function createStorage(
  location: string,
  cacheSizeInMb: number,
  encryptionProvider: string,
  encryptionKey: string
) {
  let storage: Storage = createBasicStorage(location)
  if (encryptionProvider === 'aead') {
    storage = await PgpEncryptingStorage.create(storage, encryptionKey)
    storage = await AeadEncryptingStorage.create(storage, encryptionKey)
  } else {
    storage = await PgpEncryptingStorage.create(storage, encryptionKey)
  }
  if (cacheSizeInMb) {
    storage = new CachingStorage(storage, cacheSizeInMb)
  }
  return storage
}

const fileStorageLocation = env.fileStorage.location
if (!fileStorageLocation) {
  throw new Error('FILE_STORAGE_LOCATION not defined. Upload failing')
}
if (env.fileStorage.encryptFiles && !env.fileStorage.encryptionKey) {
  throw new Error('FILE_STORAGE_ENCRYPTION_KEY must be configured')
}

export const storage: Storage = await createStorage(
  fileStorageLocation,
  env.fileStorage.cacheSizeInMb,
  env.fileStorage.encryptionProvider,
  env.fileStorage.encryptionKey
)

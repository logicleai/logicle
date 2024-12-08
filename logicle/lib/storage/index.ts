import env from '../env'
import { Storage } from './api'
import { CachingStorage } from './CachingStorage'
import { AesEncryptingStorage } from '@/ee/AesEncryptingStorage'
import { FsStorage } from './FsStorage'
import { S3Storage } from './S3Storage'
import { PgpEncryptingStorage } from '@/ee/PgpEncryptingStorage'

function createBasicStorage(location: string) {
  if (location.startsWith('s3://')) {
    // Parse S3 location
    const bucket = location.substring(5)
    if (!bucket) {
      throw new Error('Invalid S3 URL. Must be in the format s3://bucket')
    }
    return new S3Storage(bucket)
  } else {
    return new FsStorage(location)
  }
}

async function createStorage(
  location: string,
  cacheSizeInMb: number,
  encryptionProvider: string,
  encryptionKey?: string
) {
  let storage: Storage = createBasicStorage(location)
  if (encryptionKey) {
    if (encryptionProvider == 'aes') {
      storage = await AesEncryptingStorage.create(storage, encryptionKey)
    } else {
      storage = await PgpEncryptingStorage.create(storage, encryptionKey)
    }
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

export const storage: Storage = await createStorage(
  fileStorageLocation,
  env.fileStorage.cacheSizeInMb,
  env.fileStorage.encryptionProvider,
  env.fileStorage.encryptionKey
)

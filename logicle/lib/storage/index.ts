import env from '../env'
import { Storage } from './api'
import { CachingStorage } from './CachingStorage'
import { EncryptingStorage } from '@/ee/EncryptingStorage'
import { FsStorage } from './FsStorage'
import { S3Storage } from './S3Storage'

function createBasicStorage(location: string) {
  if (location.startsWith('s3://')) {
    // Parse S3 location
    const [_, bucket] = location.split('s3://')
    if (!bucket) {
      throw new Error('Invalid S3 URL. Must be in the format s3://bucket')
    }
    return new S3Storage(bucket)
  } else {
    return new FsStorage(location)
  }
}

async function createStorage(location: string, cacheSizeInMb: number, encryptionKey?: string) {
  let storage: Storage = createBasicStorage(location)
  if (encryptionKey) {
    storage = await EncryptingStorage.create(storage, encryptionKey)
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
  env.fileStorage.encryptionKey
)

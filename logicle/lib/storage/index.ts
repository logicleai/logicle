import env from '../env'
import { Storage } from './api'
import { CachingStorage } from './CachingStorage'
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

function createStorage(location: string, cacheSizeInMb: number) {
  let storage: Storage = createBasicStorage(location)
  if (cacheSizeInMb) {
    storage = new CachingStorage(storage, cacheSizeInMb)
  }
  return storage
}

const fileStorageLocation = env.fileStorage.location
if (!fileStorageLocation) {
  throw new Error('FILE_STORAGE_LOCATION not defined. Upload failing')
}
export const storage: Storage = createStorage(fileStorageLocation, env.fileStorage.cacheSizeInMb)

import { Storage } from './api'
import { FsStorage } from './FsStorage'
import { S3Storage } from './S3Storage'

function createStorage(location: string) {
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

const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
if (!fileStorageLocation) {
  throw new Error('FILE_STORAGE_LOCATION not defined. Upload failing')
}

export const storage: Storage = createStorage(fileStorageLocation)

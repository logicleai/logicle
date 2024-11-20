import fs from 'fs'
import { logger } from '@/lib/logging'
import { S3RequestPresigner } from '@aws-sdk/s3-request-presigner'
import { Hash } from '@aws-sdk/hash-node'
import { HttpRequest } from '@aws-sdk/protocol-http'
import { formatUrl } from '@aws-sdk/util-format-url'

interface Storage {
  writeFile(path: string, stream: ReadableStream<Uint8Array>, size?: number): Promise<void>
  rm(path: string): Promise<void>
  readFile(path: string): Promise<Buffer>
}

abstract class BaseStorage implements Storage {
  abstract writeFile(path: string, stream: ReadableStream<Uint8Array>): Promise<void>
  abstract rm(path: string): Promise<void>
  abstract readFile(path: string): Promise<Buffer>
  async writeBuffer(path: string, buffer: Buffer) {
    function bufferToReadableStream(buffer: Buffer): ReadableStream<Uint8Array> {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer)) // Push the whole buffer as Uint8Array
          controller.close() // Close the stream
        },
      })
    }
    await this.writeFile(path, bufferToReadableStream(buffer))
  }
}

class FsStorage extends BaseStorage {
  rootPath: string
  constructor(rootPath: string) {
    super()
    try {
      if (!fs.existsSync(rootPath)) {
        fs.mkdirSync(rootPath, { recursive: true })
      }
    } catch (error) {
      // this might happen say... for privileges missing
      logger.info('Failed creating file storage directory')
      throw error
    }
    this.rootPath = rootPath
  }

  async rm(path: string) {
    const fsPath = `${fileStorageLocation}/${path}`
    await fs.promises.rm(fsPath)
  }

  async readFile(path: string) {
    const fsPath = `${fileStorageLocation}/${path}`
    return await fs.promises.readFile(fsPath)
  }

  async writeFile(path: string, stream: ReadableStream<Uint8Array>) {
    const fullPath = `${this.rootPath}/${path}`
    let readBytes = 0
    let lastNotificationMb = 0
    const notificationUnit = 1048576
    const reader = stream.getReader()
    const outputStream = await fs.promises.open(fullPath, 'w')
    try {
      for (;;) {
        const data = await reader.read()
        if (data.done) {
          break
        }
        await outputStream.write(data.value)
        readBytes = readBytes + data.value.length
        const readMb = Math.trunc(readBytes / notificationUnit)
        if (lastNotificationMb != readMb) {
          lastNotificationMb = readMb
          logger.debug(`Read ${readMb * notificationUnit}`)
        }
      }
    } catch (e) {
      await fs.promises.rm(fullPath)
    } finally {
      await outputStream.close()
    }
    logger.debug(`Total read = ${readBytes}`)
  }
}

class S3Storage extends BaseStorage {
  bucketName: string
  region: string
  presigner: S3RequestPresigner
  hostName: string
  constructor(bucketName: string) {
    super()
    this.region = process.env.AWS_DEFAULT_REGION!
    this.presigner = new S3RequestPresigner({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_DEFAULT_REGION!,
      sha256: Hash.bind(null, 'sha256'),
    })
    this.bucketName = bucketName
    this.hostName = `${this.bucketName}.s3.${this.region}.amazonaws.com`
  }

  async writeFile(path: string, stream: ReadableStream<Uint8Array>, size?: number): Promise<void> {
    try {
      const headers = {
        'Content-Length': `${size}`,
      }
      const response = await this.fetch('PUT', path, headers, stream)
      await response.text()
      console.log(`Successfully uploaded ${path} to bucket ${this.bucketName}`)
    } catch (error) {
      console.error(`Failed to upload ${path} to bucket ${this.bucketName}:`, error)
      throw error
    }
  }

  async rm(path: string): Promise<void> {
    const presignedUrl = await this.createRequest('DELETE', path)
    const response = await fetch(presignedUrl)
    await response.arrayBuffer()
  }

  async readFile(path: string): Promise<Buffer> {
    const response = await this.fetch('GET', path)
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async fetch(method: string, path: string, headers?: Record<string, string>, body?: any) {
    const presignedUrl = await this.createRequest(method, path, headers)
    const options = {
      method,
      body: body,
      duplex: body ? 'half' : undefined,
      headers: headers,
    }
    return await fetch(presignedUrl, options)
  }

  async createRequest(method: string, path: string, headers?: Record<string, string>) {
    const request = new HttpRequest({
      protocol: 'https',
      hostname: this.hostName,
      method,
      path: `/${path}`,
      headers: headers,
    })
    const signedRequest = await this.presigner.presign(request)
    return formatUrl(signedRequest)
  }
}

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

export const storage = createStorage(fileStorageLocation)

import { BaseStorage } from './api'
import { logger } from '@/lib/logging'
import { Upload } from '@aws-sdk/lib-storage'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
export class S3Storage extends BaseStorage {
  bucketName: string
  region: string
  hostName: string
  s3Client: S3Client
  constructor(bucketName: string) {
    super()
    this.region = process.env.AWS_DEFAULT_REGION!
    // A single shared client is used for both reads and writes.
    // maxSockets is raised well above the default (50) because pull-based
    // streaming keeps connections open for the full duration of each download;
    // many concurrent slow clients would otherwise exhaust the pool and delay
    // uploads waiting for a free connection.
    this.s3Client = new S3Client({
      region: process.env.AWS_DEFAULT_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      requestHandler: { maxSockets: 500 } as never,
    })
    this.bucketName = bucketName
    this.hostName = `${this.bucketName}.s3.${this.region}.amazonaws.com`
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: path,
          Body: stream,
        },
        queueSize: 4,
        partSize: 5 * 1024 * 1024, // 5MB per part (minimum S3 part size)
      })
      await upload.done()
      logger.info(`Successfully uploaded ${path} to bucket ${this.bucketName}`)
    } catch (error) {
      logger.info(`Failed to upload ${path} to bucket ${this.bucketName}. Forwarding exception`)
      throw error
    }
  }

  async rm(path: string): Promise<void> {
    try {
      const params = {
        Bucket: this.bucketName, // Replace with your bucket name
        Key: path, // The path to the object
      }
      const command = new GetObjectCommand(params)
      const response = await this.s3Client.send(command)
      const body = response.Body
      if (body) {
        await body.transformToByteArray() //whatever happens... flush the stream
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NoSuchKey') {
          logger.info(`Can't delete non existing object at ${path}`)
          return
        } else {
          logger.error(`Failed to process the S3 object at ${path}`, error)
        }
      }
      throw error // Re-throw the error if necessary
    }
  }

  async readStream(
    path: string,
    _encrypted?: boolean,
    _options?: { expectedSizeBytes?: number; bypassCache?: boolean }
  ): Promise<ReadableStream<Uint8Array>> {
    try {
      const params = {
        Bucket: this.bucketName, // Replace with your bucket name
        Key: path, // The path to the object
      }
      const command = new GetObjectCommand(params)
      const response = await this.s3Client.send(command)
      const body = response.Body
      if (!body) {
        throw new Error(`Failed reading S3 object ${path}: No body`)
      }
      return body.transformToWebStream()
    } catch (error) {
      logger.error('Failed reading S3 object', error)
      throw error
    }
  }
}

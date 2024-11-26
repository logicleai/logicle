import { S3RequestPresigner } from '@aws-sdk/s3-request-presigner'
import { Hash } from '@aws-sdk/hash-node'
import { HttpRequest } from '@aws-sdk/protocol-http'
import { formatUrl } from '@aws-sdk/util-format-url'
import { BaseStorage } from './api'
import { logger } from '../logging'

export class S3Storage extends BaseStorage {
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

  async writeStream(path: string, stream: ReadableStream<Uint8Array>, size: number): Promise<void> {
    try {
      const headers = {
        'Content-Length': `${size}`,
      }
      const response = await this.fetch('PUT', path, headers, stream)
      const text = await response.text()
      if (response.status != 200) {
        throw new Error(`Response status ${response.status} - ${text}`)
      }
      logger.debug(`Successfully uploaded ${path} to bucket ${this.bucketName}`)
    } catch (error) {
      logger.error(`Failed to upload ${path} to bucket ${this.bucketName}:`, error)
      throw error
    }
  }

  async rm(path: string): Promise<void> {
    const presignedUrl = await this.createRequest('DELETE', path)
    const response = await fetch(presignedUrl)
    // should be a 204
    if (response.status % 100 != 2) {
      const text = await response.text()
      throw new Error(`Failed deleting S3 object: ${text}`)
    }
    await response.arrayBuffer()
  }

  async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
    try {
      const response = await this.fetch('GET', path)
      if (response.status != 200) {
        const text = await response.text()
        throw new Error(`Failed reading S3 object ${path}: ${text}`)
      }
      if (!response.body) {
        throw new Error(`Failed reading S3 object ${path}: No body`)
      }
      return response.body
    } catch (error) {
      logger.error('Failed reading S3 object', error)
      throw error
    }
  }

  async readBuffer(path: string): Promise<Buffer> {
    try {
      const response = await this.fetch('GET', path)
      if (response.status != 200) {
        const text = await response.text()
        throw new Error(`Failed reading S3 object: ${text}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (error) {
      console.log(error)
      throw error
    }
  }

  async fetch(
    method: string,
    path: string,
    headers?: Record<string, string>,
    body?: ReadableStream<Uint8Array>
  ) {
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

import { logger } from '@/lib/logging'
import { BaseStorage } from './api'
import fs, { createReadStream } from 'node:fs'
import { nodeStreamToReadableStream } from './utils'

export class FsStorage extends BaseStorage {
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
    const fsPath = `${this.rootPath}/${path}`
    await fs.promises.rm(fsPath)
  }

  async readBuffer(path: string) {
    const fsPath = `${this.rootPath}/${path}`
    return await fs.promises.readFile(fsPath)
  }

  async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
    const fsPath = `${this.rootPath}/${path}`
    const nodeStream = createReadStream(fsPath)
    return nodeStreamToReadableStream(nodeStream)
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>) {
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
        if (lastNotificationMb !== readMb) {
          lastNotificationMb = readMb
          logger.debug(`Read ${readMb * notificationUnit}`)
        }
      }
    } catch (e) {
      await fs.promises.rm(fullPath)
      throw e
    } finally {
      await outputStream.close()
    }
    logger.debug(`Total read = ${readBytes}`)
  }
}

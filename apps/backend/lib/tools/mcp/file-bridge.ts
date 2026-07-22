import type { Duplex } from 'node:stream'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { getFileWithId } from '@/models/file'
import { storage } from '@/lib/storage'

export type McpPublishedArtifact = { name: string; mimeType: string; data: Buffer }

const safeFileId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)
const safeSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 * 1024 * 1024

const write = async (channel: Duplex, data: string | Buffer) => {
  if (channel.write(data)) return
  await new Promise<void>((resolve, reject) => {
    channel.once('drain', resolve)
    channel.once('error', reject)
  })
}

/** A private, ordered protocol over FD 3. Headers are newline-delimited JSON;
 * publish-artifact headers are followed by exactly `size` raw bytes. */
export class McpFileBridge {
  private buffer = Buffer.alloc(0)
  private pendingArtifact?: { requestId?: string; name: string; mimeType: string; size: number }
  private queue = Promise.resolve()
  private artifacts: McpPublishedArtifact[] = []

  constructor(
    private readonly channel: Duplex,
    private readonly scope: { conversationId: string; userId: string }
  ) {
    channel.on('data', (chunk: Buffer) => this.receive(Buffer.from(chunk)))
  }

  takeArtifacts(): McpPublishedArtifact[] {
    const artifacts = this.artifacts
    this.artifacts = []
    return artifacts
  }

  private receive(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      if (this.pendingArtifact) {
        if (this.buffer.length < this.pendingArtifact.size) return
        const artifact = this.pendingArtifact
        const data = this.buffer.subarray(0, artifact.size)
        this.buffer = this.buffer.subarray(artifact.size)
        this.pendingArtifact = undefined
        this.enqueue(async () => {
          this.artifacts.push({ name: artifact.name, mimeType: artifact.mimeType, data })
          await write(this.channel, JSON.stringify({ type: 'artifact', requestId: artifact.requestId }) + '\n')
        })
        continue
      }
      const newline = this.buffer.indexOf(0x0a)
      if (newline < 0) return
      const line = this.buffer.subarray(0, newline).toString('utf8')
      this.buffer = this.buffer.subarray(newline + 1)
      let request: Record<string, unknown>
      try { request = JSON.parse(line) } catch {
        this.enqueue(() => write(this.channel, JSON.stringify({ type: 'error', message: 'Invalid bridge request' }) + '\n'))
        continue
      }
      if (request.type === 'publish-artifact' && typeof request.name === 'string' && typeof request.mimeType === 'string' && safeSize(request.size)) {
        this.pendingArtifact = { requestId: typeof request.requestId === 'string' ? request.requestId : undefined, name: request.name, mimeType: request.mimeType, size: request.size }
        continue
      }
      this.enqueue(() => this.handleRequest(request))
    }
  }

  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue.then(task).catch(() => { this.channel.destroy() })
  }

  private async handleRequest(request: Record<string, unknown>) {
    const requestId = typeof request.requestId === 'string' ? request.requestId : undefined
    if (request.type !== 'read-file' || !safeFileId(request.id)) {
      await write(this.channel, JSON.stringify({ type: 'error', requestId, message: 'Invalid file request' }) + '\n')
      return
    }
    if (!(await canAccessFile({ userId: this.scope.userId }, request.id))) {
      await write(this.channel, JSON.stringify({ type: 'error', requestId, message: 'File access denied' }) + '\n')
      return
    }
    const file = await getFileWithId(request.id)
    if (!file) {
      await write(this.channel, JSON.stringify({ type: 'error', requestId, message: 'File not found' }) + '\n')
      return
    }
    const data = await storage.readBuffer(file.path, file.encryption)
    await write(this.channel, JSON.stringify({ type: 'file', requestId, name: file.name, mimeType: file.type, size: data.length }) + '\n')
    await write(this.channel, data)
  }
}

export const attachMcpFileBridge = (channel: Duplex, scope: { conversationId: string; userId: string }) =>
  new McpFileBridge(channel, scope)

import { db } from '@/db/database'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { error, noBody, notFound, forbidden, operation, responseSpec, errorSpec } from '@/lib/routes'
import { storage } from '@/lib/storage'
import { logger } from '@/lib/logging'
import { scheduleFileAnalysisForFile } from '@/lib/file-analysis'
import { finalizeUploadedFile } from '@/backend/lib/files/upload-dedup'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import env from '@/lib/env'

const MAX_ACTIVE_FILE_DOWNLOADS_GLOBAL = 24
const MAX_ACTIVE_FILE_DOWNLOADS_PER_USER_FILE = 2
let activeFileDownloads = 0
const activeFileDownloadsByUserFile = new Map<string, number>()

const acquireDownloadSlot = (sessionUserId: string, fileId: string): boolean => {
  const key = `${sessionUserId}:${fileId}`
  const perKey = activeFileDownloadsByUserFile.get(key) ?? 0
  if (activeFileDownloads >= MAX_ACTIVE_FILE_DOWNLOADS_GLOBAL) {
    return false
  }
  if (perKey >= MAX_ACTIVE_FILE_DOWNLOADS_PER_USER_FILE) {
    return false
  }
  activeFileDownloads += 1
  activeFileDownloadsByUserFile.set(key, perKey + 1)
  return true
}

const releaseDownloadSlot = (sessionUserId: string, fileId: string): void => {
  const key = `${sessionUserId}:${fileId}`
  const perKey = activeFileDownloadsByUserFile.get(key) ?? 0
  if (perKey <= 1) {
    activeFileDownloadsByUserFile.delete(key)
  } else {
    activeFileDownloadsByUserFile.set(key, perKey - 1)
  }
  activeFileDownloads = Math.max(0, activeFileDownloads - 1)
}

// A synchronized tee, i.e. faster reader has to wait
function _synchronizedTee(
  input: ReadableStream
): [ReadableStream<Uint8Array>, ReadableStream<Uint8Array>] {
  type PromiseResolver = () => void
  const result: ReadableStream<Uint8Array>[] = []
  let queuedResolver: PromiseResolver | undefined
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = []
  const reader = input.getReader()
  for (let i = 0; i < 2; i++) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controllers[i] = controller
      },
      async pull() {
        //logger.debug(`Pulling from ${i}`)
        const queuedResolverTmp = queuedResolver
        if (queuedResolverTmp) {
          // If the other stream is waiting, we may
          // fetch data from the reader and send it
          // to both controllers
          queuedResolver = undefined
          //logger.debug(`Reading`)
          const result = await reader.read()
          controllers.forEach((controller) => {
            if (result.done) {
              //logger.debug(`Closing ${idx}`)
              controller.close()
            } else {
              //logger.debug(`Enqueueing ${idx}`)
              controller.enqueue(result.value)
            }
          })
          queuedResolverTmp()
        } else {
          return new Promise((resolve) => {
            queuedResolver = resolve
          })
        }
      },
    })
    result[i] = stream
  }
  return [result[0], result[1]]
}

export const PUT = operation({
  name: 'Upload file content',
  authentication: 'user',
  responses: [
    responseSpec(204),
    errorSpec(400),
    errorSpec(403),
    errorSpec(404),
    errorSpec(500),
  ] as const,
  implementation: async ({ params, request, signal, session }) => {
    const file = await db
      .selectFrom('File')
      .leftJoin('AssistantVersionFile', (join) =>
        join.onRef('File.id', '=', 'AssistantVersionFile.fileId')
      )
      .selectAll()
      .where('id', '=', params.fileId)
      .executeTakeFirst()
    if (!file) {
      return notFound()
    }
    if (!(await canAccessFile({ userId: session.userId, userRole: session.userRole }, params.fileId))) {
      return forbidden()
    }
    let clientDisconnected = false
    const onAbortLike = () => {
      clientDisconnected = true
    }
    signal.addEventListener('abort', onAbortLike)
    const requestBodyStream = request.stream
    if (!requestBodyStream) {
      return error(400, 'Missing body')
    }

    const hash = createHash('sha256')
    let byteSize = 0
    const hashingStream = requestBodyStream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          hash.update(chunk)
          byteSize += chunk.byteLength
          controller.enqueue(chunk)
        },
      })
    )

    try {
      await storage.writeStream(file.path, hashingStream, env.fileStorage.encryptFiles)
    } catch (e) {
      if (clientDisconnected) {
        logger.error('Upload aborted by user')
        return error(500, 'Upload aborted')
      } else {
        logger.error('Upload failure', e)
        return error(500, 'Upload failure')
      }
    }

    const contentHash = hash.digest('hex')
    await finalizeUploadedFile({
      fileId: params.fileId,
      filePath: file.path,
      fileType: file.type,
      fileSize: byteSize,
      fileEncrypted: env.fileStorage.encryptFiles ? 1 : 0,
      contentHash,
    })

    const fileForAnalysis = await db
      .selectFrom('File')
      .innerJoin('FileBlob', 'FileBlob.id', 'File.fileBlobId')
      .select([
        'File.id as id',
        'File.name as name',
        'File.origin as origin',
        'File.ownerType as ownerType',
        'File.ownerId as ownerId',
        'File.path as path',
        'File.type as type',
        'File.createdAt as createdAt',
        'File.fileBlobId as fileBlobId',
        'FileBlob.size as size',
        'FileBlob.encrypted as encrypted',
      ])
      .where('File.id', '=', params.fileId)
      .executeTakeFirst()
    if (fileForAnalysis) {
      scheduleFileAnalysisForFile(fileForAnalysis)
    }
    return noBody()
  },
})

export const GET = operation({
  name: 'Download file content',
  authentication: 'user',
  responses: [responseSpec(200, z.any()), errorSpec(403), errorSpec(404), errorSpec(429)] as const,
  implementation: async ({ params, session }) => {
    const file = await db
      .selectFrom('File')
      .leftJoin('FileBlob', 'FileBlob.id', 'File.fileBlobId')
      .select(['File.path as path', 'File.type as type', 'FileBlob.size as size', 'FileBlob.encrypted as encrypted'])
      .where('File.id', '=', params.fileId)
      .executeTakeFirst()
    if (!file) {
      return notFound()
    }
    if (!(await canAccessFile({ userId: session.userId, userRole: session.userRole }, params.fileId))) {
      return forbidden()
    }
    if (!acquireDownloadSlot(session.userId, params.fileId)) {
      return error(429, 'Too many concurrent downloads for this file')
    }
    let released = false
    const release = () => {
      if (released) return
      released = true
      releaseDownloadSlot(session.userId, params.fileId)
    }
    try {
      const fileContent = await storage.readStream(file.path, !!file.encrypted, {
        expectedSizeBytes: file.size ?? undefined,
      })
      const reader = fileContent.getReader()
      const guardedStream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read()
            if (done) {
              release()
              controller.close()
            } else {
              controller.enqueue(value)
            }
          } catch (err) {
            release()
            controller.error(err)
          }
        },
        async cancel(reason) {
          release()
          await reader.cancel(reason)
        },
      })
      return new Response(guardedStream, {
        headers: {
          'content-type': file.type,
          ...(typeof file.size === 'number' ? { 'content-length': `${file.size}` } : {}),
        },
      })
    } catch (err) {
      release()
      throw err
    }
  },
})

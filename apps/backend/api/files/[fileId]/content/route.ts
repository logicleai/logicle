import { db } from '@/db/database'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { error, noBody, notFound, forbidden, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { storage } from '@/lib/storage'
import { logger } from '@/lib/logging'
import { scheduleFileAnalysisForFile } from '@/lib/file-analysis'
import { finalizeUploadedFile } from '@/backend/lib/files/upload-dedup'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import env from '@/lib/env'

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

const deduplicatedFileSchema = z.object({ id: z.string() })

export const PUT = operation({
  name: 'Upload file content',
  authentication: 'user',
  responses: [
    responseSpec(204),
    responseSpec(200, deduplicatedFileSchema),
    errorSpec(400),
    errorSpec(404),
    errorSpec(500),
  ] as const,
  implementation: async ({ params, request, signal }) => {
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
    const canonicalId = await finalizeUploadedFile({
      fileId: params.fileId,
      filePath: file.path,
      fileType: file.type,
      fileSize: byteSize,
      fileEncrypted: env.fileStorage.encryptFiles ? 1 : 0,
      contentHash,
    })

    if (canonicalId) {
      return ok({ id: canonicalId })
    }

    const fileForAnalysis = await db
      .selectFrom('File')
      .innerJoin('FileBlob', 'FileBlob.id', 'File.fileBlobId')
      .select([
        'File.id as id',
        'File.name as name',
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
  responses: [responseSpec(200, z.any()), errorSpec(403), errorSpec(404)] as const,
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
    if (!(await canAccessFile(session, params.fileId))) {
      return forbidden()
    }
    const fileContent = await storage.readStream(file.path, !!file.encrypted)
    return new Response(fileContent, {
      headers: {
        'content-type': file.type,
        ...(typeof file.size === 'number' ? { 'content-length': `${file.size}` } : {}),
      },
    })
  },
})

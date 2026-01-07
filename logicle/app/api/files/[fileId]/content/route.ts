import { db } from '@/db/database'
import { error, noBody, notFound, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { storage } from '@/lib/storage'
import { cachingExtractor } from '@/lib/textextraction/cache'
import { logger } from '@/lib/logging'
import { z } from 'zod'

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

export const { PUT, GET } = route({
  PUT: operation({
    name: 'Upload file content',
    authentication: 'user',
    responses: [
      responseSpec(204),
      errorSpec(400),
      errorSpec(404),
      errorSpec(500),
    ] as const,
    implementation: async (req: Request, params: { fileId: string }) => {
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
      req.signal.addEventListener('abort', onAbortLike)
      const requestBodyStream = req.body as ReadableStream<Uint8Array>
      if (!requestBodyStream) {
        return error(400, 'Missing body')
      }

      try {
        await storage.writeStream(file.path, requestBodyStream, !!file.encrypted)
      } catch (e) {
        if (clientDisconnected) {
          logger.error('Upload aborted by user')
          // The client has gone away. It is quite unlikely that this response will reach it
          return error(500, 'Upload aborted')
        } else {
          logger.error('Upload failure', e)
          return error(500, 'Upload failure')
        }
      }
      await db.updateTable('File').set({ uploaded: 1 }).where('id', '=', params.fileId).execute()
      // Warm up cache
      cachingExtractor.extractFromFile(file)

      return noBody()
    },
  }),
  // TODO: security hole here.
  // It's probably simpler to export APIs such as /chat/.../attachments/{fileId} in order to be
  // able to easily verify privileges in the backend, or... add an owner to a file entry in db
  // (more complicate)
  GET: operation({
    name: 'Download file content',
    authentication: 'user',
    responses: [responseSpec(200, z.any()), errorSpec(404)] as const,
    implementation: async (_req: Request, params: { fileId: string }) => {
      const file = await db
        .selectFrom('File')
        .selectAll()
        .where('id', '=', params.fileId)
        .executeTakeFirst()
      if (!file) {
        return notFound()
      }
      const fileContent = await storage.readStream(file.path, !!file.encrypted)
      return new Response(fileContent, {
        headers: {
          'content-type': file.type,
          'content-length': `${file.size}`,
        },
      })
    },
  }),
})

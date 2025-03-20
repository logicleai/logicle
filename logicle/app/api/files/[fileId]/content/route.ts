import { requireSession } from '@/app/api/utils/auth'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { db } from '@/db/database'
import { buildToolImplementationFromDbInfo } from '@/lib/tools/enumerate'
import { getTools } from '@/models/tool'
import * as dto from '@/types/dto'
import { ToolImplementation } from '@/lib/chat/tools'
import { logger } from '@/lib/logging'
import { storage } from '@/lib/storage'

// A synchronized tee, i.e. faster reader has to wait
function synchronizedTee(
  input: ReadableStream
): [ReadableStream<Uint8Array>, ReadableStream<Uint8Array>] {
  type PromiseResolver = () => void
  const result: ReadableStream<Uint8Array>[] = []
  let queuedResolver: PromiseResolver | undefined = undefined
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
          return new Promise(function (resolve) {
            queuedResolver = resolve
          })
        }
      },
    })
    result[i] = stream
  }
  return [result[0], result[1]]
}

export const PUT = requireSession(async (session, req, params: { fileId: string }) => {
  const file = await db
    .selectFrom('File')
    .leftJoin('AssistantFile', (join) => join.onRef('File.id', '=', 'AssistantFile.fileId'))
    .selectAll()
    .where('id', '=', params.fileId)
    .executeTakeFirst()
  if (!file) {
    return ApiResponses.noSuchEntity()
  }
  let requestBodyStream = req.body as ReadableStream<Uint8Array>
  if (!requestBodyStream) {
    return ApiResponses.invalidParameter('Missing body')
  }

  const upload = async (tool: dto.ToolDTO, stream: ReadableStream, impl: ToolImplementation) => {
    // First create the db entry in uploading state, in order to
    // be able to be able to better handle failures
    try {
      await db
        .insertInto('ToolFile')
        .values({
          fileId: file.id,
          toolId: tool.id,
          status: 'uploading',
        })
        .executeTakeFirst()

      const result = await impl.processFile!({
        fileId: params.fileId,
        fileName: file.name,
        contentType: file.type,
        contentStream: stream,
        assistantId: file.assistantId ?? undefined,
      })
      await db
        .updateTable('ToolFile')
        .set({ status: 'uploaded', externalId: result.externalId })
        .where('fileId', '=', file.id)
        .where('toolId', '=', tool.id)
        .executeTakeFirst()
    } catch (e) {
      logger.error(`Failed submitting file to tool ${tool.id} (${tool.name}): ${e}`)
      await db
        .updateTable('ToolFile')
        .set({ status: 'failed' })
        .where('fileId', '=', file.id)
        .where('toolId', '=', tool.id)
        .executeTakeFirst()
    }
  }

  // Upload / save tasks are executed concurrently, but we want to return only when we're done.
  // So... we collect promises here, in order to await Promise.all() them later
  const tasks: Promise<void>[] = []

  for (const tool of await getTools()) {
    const impl = await buildToolImplementationFromDbInfo(tool)
    if (impl && impl.processFile) {
      const [s1, s2] = synchronizedTee(requestBodyStream)
      requestBodyStream = s1
      tasks.push(upload(tool, s2, impl))
    }
  }
  tasks.push(storage.writeStream(file.path, requestBodyStream, file.encrypted ? true : false))
  await db.updateTable('File').set({ uploaded: 1 }).where('id', '=', params.fileId).execute()
  await Promise.all(tasks)
  return ApiResponses.success()
})

// TODO: security hole here.
// It's probably simpler to export APIs such as /chat/.../attachments/{fileId} in order to be
// able to easily verify privileges in the backend, or... add an owner to a file entry in db
// (more complicate)
export const GET = requireSession(async (session, req, params: { fileId: string }) => {
  const file = await db
    .selectFrom('File')
    .selectAll()
    .where('id', '=', params.fileId)
    .executeTakeFirst()
  if (!file) {
    return ApiResponses.noSuchEntity()
  }
  const fileContent = await storage.readStream(file.path, file.encrypted ? true : false)
  return new Response(fileContent, {
    headers: {
      'content-type': file.type,
      'content-length': `${file.size}`,
    },
  })
})

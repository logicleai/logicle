import fs from 'fs'
import { requireSession } from '@/app/api/utils/auth'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { db } from '@/db/database'
import { buildToolImplementationFromDbInfo } from '@/lib/tools/enumerate'
import { getTools } from '@/models/tool'
import * as dto from '@/types/dto'
import { ToolImplementation } from '@/lib/chat'

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
        //console.log(`Pulling from ${i}`)
        const queuedResolverTmp = queuedResolver
        if (queuedResolverTmp) {
          // If the other stream is waiting, we may
          // fetch data from the reader and send it
          // to both controllers
          queuedResolver = undefined
          //console.log(`Reading`)
          const result = await reader.read()
          controllers.forEach((controller) => {
            if (result.done) {
              //console.log(`Closing ${idx}`)
              controller.close()
            } else {
              //console.log(`Enqueueing ${idx}`)
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

async function copyStreamToFile(stream: ReadableStream<Uint8Array>, fsPath: string) {
  let readBytes = 0
  let lastNotificationMb = 0
  const notificationUnit = 1048576
  const reader = stream.getReader()
  const outputStream = await fs.promises.open(fsPath, 'w')
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
        console.log(`Read ${readMb * notificationUnit}`)
      }
    }
  } catch (e) {
    await fs.promises.rm(fsPath)
  } finally {
    outputStream.close()
  }
  console.log(`Total read = ${readBytes}`)
}

export const PUT = requireSession(async (session, req, route: { params: { fileId: string } }) => {
  const file = await db
    .selectFrom('File')
    .leftJoin('AssistantFile', (join) => join.onRef('File.id', '=', 'AssistantFile.fileId'))
    .selectAll()
    .where('id', '=', route.params.fileId)
    .executeTakeFirst()
  if (!file) {
    return ApiResponses.noSuchEntity()
  }
  let requestBodyStream = req.body as ReadableStream<Uint8Array>
  if (!requestBodyStream) {
    return ApiResponses.invalidParameter('Missing body')
  }
  const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
  if (!fileStorageLocation) {
    throw new Error('FILE_STORAGE_LOCATION not defined. Upload failing')
  }
  try {
    if (!fs.existsSync(fileStorageLocation)) {
      fs.mkdirSync(fileStorageLocation, { recursive: true })
    }
  } catch (error) {
    // this might happen say... for privileges missing
    console.log(error)
    throw error
  }

  const fsPath = `${fileStorageLocation}/${file.path}`

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
        fileId: route.params.fileId,
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
      console.log(`Failed submitting file to tool ${tool.id} (${tool.name}): ${e}`)
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
  const tasks: Promise<any>[] = []

  for (const tool of await getTools()) {
    const impl = await buildToolImplementationFromDbInfo(tool)
    if (impl && impl.processFile) {
      const [s1, s2] = synchronizedTee(requestBodyStream)
      requestBodyStream = s1
      tasks.push(upload(tool, s2, impl))
    }
  }
  tasks.push(copyStreamToFile(requestBodyStream, fsPath))
  await db.updateTable('File').set({ uploaded: 1 }).where('id', '=', route.params.fileId).execute()
  await Promise.all(tasks)
  return ApiResponses.success()
})

// TODO: security hole here.
// It's probably simpler to export APIs such as /chat/.../attachments/{fileId} in order to be
// able to easily verify privileges in the backend, or... add an owner to a file entry in db
// (more complicate)
export const GET = requireSession(async (session, req, route: { params: { fileId: string } }) => {
  const file = await db
    .selectFrom('File')
    .selectAll()
    .where('id', '=', route.params.fileId)
    .executeTakeFirst()
  if (!file) {
    return ApiResponses.noSuchEntity()
  }
  const fsPath = `${process.env.FILE_STORAGE_LOCATION}/${file.path}`
  const fileContent = await fs.promises.readFile(fsPath)
  return new Response(fileContent, { headers: { 'content-type': file.type } })
})

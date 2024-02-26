import fs from 'fs'
import { requireSession } from '@/app/api/utils/auth'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { db } from '@/db/database'
import { buildToolImplementationFromDbInfo } from '@/lib/tools/enumerate'
import { getTools } from 'models/tool'
import { ToolDTO } from '@/types/dto'

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
  const contentType = file.type
  const imgStream = req.body as ReadableStream<Uint8Array>
  if (!imgStream) {
    return ApiResponses.invalidParameter('Missing body')
  }
  const reader = imgStream.getReader()
  let readBytes = 0
  let lastNotificationMb = 0
  const notificationUnit = 1048576
  const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
  if (!fileStorageLocation) {
    throw new Error('FILE_STORAGE_LOCATION not defined. Upload failing')
  }
  try {
    if (!fs.existsSync(fileStorageLocation)) {
      fs.mkdirSync(fileStorageLocation, { recursive: true })
    }
  } catch (error) {
    // this might happen in very rare situations (race conditions)
    console.log(error)
  }

  const fsPath = `${fileStorageLocation}/${file.path}`
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

  await db.updateTable('File').set({ uploaded: 1 }).where('id', '=', route.params.fileId).execute()

  const upload = async (tool: ToolDTO) => {
    const impl = buildToolImplementationFromDbInfo(tool)
    if (impl && impl.upload) {
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
        const result = await impl.upload({
          fileId: route.params.fileId,
          path: fsPath,
          contentType,
          assistantId: file.assistantId ?? undefined,
        })
        await db
          .updateTable('ToolFile')
          .set({ status: 'uploaded' })
          //          .set({ externalId: result.externalId })
          .where('fileId', '=', file.id)
          .where('toolId', '=', tool.id)
          .executeTakeFirst()
      } catch (e) {
        console.log(`Failed submitting file to tool ${tool.id} (${tool.name})`)
        await db
          .updateTable('ToolFile')
          .set({ status: 'failed' })
          .where('fileId', '=', file.id)
          .where('toolId', '=', tool.id)
          .executeTakeFirst()
      }
    }
  }
  for (const tool of await getTools()) {
    upload(tool)
  }
  return ApiResponses.success()
})

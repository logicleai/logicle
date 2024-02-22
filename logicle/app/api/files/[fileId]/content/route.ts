import fs from 'fs'
import { requireSession } from '@/app/api/utils/auth'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { db } from '@/db/database'
import { availableTools } from '@/lib/tools/enumerate'

export const PUT = requireSession(async (session, req, route: { params: { fileId: string } }) => {
  const file = await db
    .selectFrom('File')
    .selectAll()
    .where('id', '=', route.params.fileId)
    .executeTakeFirst()
  if (!file) {
    return ApiResponses.noSuchEntity()
  }
  const contentType = req.headers.get('content-type')
  const imgStream = req.body as ReadableStream<Uint8Array>
  const reader = imgStream!.getReader()
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
  } finally {
    outputStream.close()
  }
  console.log(`Total read = ${readBytes}`)

  await db.updateTable('File').set({ uploaded: 1 }).where('id', '=', route.params.fileId).execute()

  for (const tool of await availableTools()) {
    if (tool.upload) {
      tool.upload(route.params.fileId, fsPath, contentType || undefined)
    }
  }
  return ApiResponses.success()
})

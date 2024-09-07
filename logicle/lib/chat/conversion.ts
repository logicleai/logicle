import * as ai from 'ai'
import * as schema from '@/db/schema'
import { CoreMessage } from 'ai'
import fs from 'fs'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'

const loadImagePartFromFileEntry = async (fileEntry: schema.File) => {
  const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
  const fileContent = await fs.promises.readFile(`${fileStorageLocation}/${fileEntry.path}`)
  const image: ai.ImagePart = {
    type: 'image',
    image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
  }
  return image
}

// Not easy to do it right... Claude will crash if the input image format is not supported
// But if a user uploads say a image/svg+xml file, and we simply remove it here...
// we might crash for empty content, or the LLM can complain because nothing is uploaded
// The issue is even more seriouos because if a signle request is not valid, we can't continue the conversation!!!
const acceptableImageTypes = ['image/jpeg', 'image/png', 'image/webp']
export const dtoMessageToLlmMessage = async (m: dto.Message): Promise<ai.CoreMessage> => {
  const message = {
    role: m.role as dto.MessageType,
    content: m.content,
  } as CoreMessage
  if (m.attachments.length != 0 && message.role == 'user') {
    const messageParts: typeof message.content = []
    if (m.content.length != 0)
      messageParts.push({
        type: 'text',
        text: m.content,
      })
    const imageParts = (
      await Promise.all(
        m.attachments.map(async (a) => {
          const fileEntry = await getFileWithId(a.id)
          if (!fileEntry) {
            console.warn(`Can't find entry for attachment ${a.id}`)
            return undefined
          }
          if (!acceptableImageTypes.includes(fileEntry.type)) {
            return undefined
          }
          return loadImagePartFromFileEntry(fileEntry)
        })
      )
    ).filter((a) => a != undefined)
    message.content = [...messageParts, ...imageParts]
  }
  return message
}

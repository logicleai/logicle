import { ToolImplementation, ToolFunction, ToolBuilder } from '@/lib/chat/tools'
import { Dall_ePluginInterface, Dall_ePluginParams } from './interface'
import OpenAI from 'openai'
import fs from 'fs'
import { addFile } from '@/models/file'
import { nanoid } from 'nanoid'
import { InsertableFile } from '@/types/dto'
import { logger } from '@/lib/logging'

export interface Params {
  prompt: string
}

export class Dall_ePlugin extends Dall_ePluginInterface implements ToolImplementation {
  static builder: ToolBuilder = (params: Record<string, any>) =>
    new Dall_ePlugin(params as Dall_ePluginParams) // TODO: need a better validation
  params: Dall_ePluginParams
  constructor(params: Dall_ePluginParams) {
    super()
    this.params = {
      ...params,
    }
  }

  functions: Record<string, ToolFunction> = {
    GenerateImage: {
      description: 'Generate an image from a textual description',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'textual description of the image to generate',
          },
        },
        required: ['name'],
      },
      invoke: async ({ params, uiLink }) => {
        const openai = new OpenAI({
          apiKey: this.params.apiKey,
        }) // Make sure your OpenAI API key is set in environment variables
        const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
        if (!fileStorageLocation) {
          throw new Error('FILE_STORAGE_LOCATION not defined. Upload failing')
        }
        const aiResponse = await openai.images.generate({
          prompt: params.prompt,
          model: 'dall-e-3',
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          response_format: 'b64_json',
        })
        const responseData = aiResponse.data
        if (responseData.length != 1 || !responseData[0].b64_json) {
          throw new Error('Unexpected response from OpenAI')
        }
        const imgBinaryData = Buffer.from(responseData[0].b64_json, 'base64')
        try {
          if (!fs.existsSync(fileStorageLocation)) {
            fs.mkdirSync(fileStorageLocation, { recursive: true })
          }
        } catch (error) {
          throw new Error(`Failed creating output directory '${fileStorageLocation}'`)
        }

        const id = nanoid()
        const name = `${id}-dalle`
        const path = name
        const fsPath = `${fileStorageLocation}/${name}`
        const outputStream = await fs.promises.open(fsPath, 'w')
        try {
          await outputStream.write(imgBinaryData)
        } finally {
          await outputStream.close()
        }

        const mimeType = 'image/png'
        const dbEntry: InsertableFile = {
          name,
          type: mimeType,
          size: imgBinaryData.byteLength,
        }
        const dbFile = await addFile(dbEntry, path)
        await uiLink.newMessage()
        uiLink.addAttachment({
          id: dbFile.id,
          mimetype: mimeType,
          name,
          size: imgBinaryData.length,
        })
        return `DALL·E displayed 1 images. The images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the ChatGPT UI already. Do not mention anything about visualizing / downloading to the user.`
      },
    },
  }
}

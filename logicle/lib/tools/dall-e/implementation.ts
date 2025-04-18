import { ToolImplementation, ToolFunction, ToolBuilder } from '@/lib/chat/tools'
import { Dall_ePluginInterface, Dall_ePluginParams } from './interface'
import OpenAI from 'openai'
import { addFile } from '@/models/file'
import { nanoid } from 'nanoid'
import { InsertableFile } from '@/types/dto'
import env from '@/lib/env'
import { expandEnv } from 'templates'
import { storage } from '@/lib/storage'

export interface Params {
  prompt: string
}

export class Dall_ePlugin extends Dall_ePluginInterface implements ToolImplementation {
  static builder: ToolBuilder = (params: Record<string, unknown>, provisioned: boolean) =>
    new Dall_ePlugin(params as unknown as Dall_ePluginParams, provisioned) // TODO: need a better validation
  params: Dall_ePluginParams
  supportedMedia = []
  provisioned: boolean
  constructor(params: Dall_ePluginParams, provisioned: boolean) {
    super()
    this.params = params
    this.provisioned = provisioned
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
          model: {
            type: 'string',
            description:
              'the name of the model that will be used to generate the image, can be dall-e-2 or dall-e-3 or any other valid model name',
            default: 'dall-e-2',
          },
        },
        additionalProperties: false,
        required: ['prompt', 'model'],
      },
      invoke: async ({ params, uiLink }) => {
        const openai = new OpenAI({
          apiKey: this.provisioned ? expandEnv(this.params.apiKey) : this.params.apiKey,
          baseURL: env.logicleCloud.images.proxyBaseUrl,
        }) // Make sure your OpenAI API key is set in environment variables
        const aiResponse = await openai.images.generate({
          prompt: '' + params.prompt,
          model: '' + params.model,
          n: 1,
          size: '1024x1024',
          //quality: 'standard',
          response_format: 'b64_json',
        })
        const responseData = aiResponse.data
        if (responseData.length != 1 || !responseData[0].b64_json) {
          throw new Error('Unexpected response from OpenAI')
        }
        const imgBinaryData = Buffer.from(responseData[0].b64_json, 'base64')
        const id = nanoid()
        const name = `${id}-dalle`
        const path = name
        await storage.writeBuffer(name, imgBinaryData, env.fileStorage.encryptFiles)
        const mimeType = 'image/png'
        const dbEntry: InsertableFile = {
          name,
          type: mimeType,
          size: imgBinaryData.byteLength,
        }
        const dbFile = await addFile(dbEntry, path, env.fileStorage.encryptFiles)
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

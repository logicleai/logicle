import {
  ToolImplementation,
  ToolFunction,
  ToolBuilder,
  ToolUILink,
  ToolInvokeParams,
} from '@/lib/chat/tools'
import { Dall_ePluginInterface, Dall_ePluginParams, Model } from './interface'
import OpenAI from 'openai'
import { addFile, getFileWithId } from '@/models/file'
import { nanoid } from 'nanoid'
import { InsertableFile } from '@/types/dto'
import env from '@/lib/env'
import { expandEnv } from 'templates'
import { storage } from '@/lib/storage'
import { ImagesResponse } from 'openai/resources/images'

function get_response_format_parameter(model: Model | string) {
  if (model == 'gpt-image-1') {
    return undefined
  } else {
    return 'b64_json'
  }
}

export class Dall_ePlugin extends Dall_ePluginInterface implements ToolImplementation {
  static builder: ToolBuilder = (params: Record<string, unknown>, provisioned: boolean) =>
    new Dall_ePlugin(params as unknown as Dall_ePluginParams, provisioned) // TODO: need a better validation
  forcedModel: Model | string | undefined
  supportedMedia = []
  functions: Record<string, ToolFunction>
  constructor(
    private params: Dall_ePluginParams,
    private provisioned: boolean
  ) {
    super()
    this.forcedModel = params.model
    this.functions = {
      GenerateImage: {
        description: 'Generate one or more images from a textual description',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'textual description of the image(s) to generate',
            },
            ...(this.forcedModel
              ? {}
              : {
                  model: {
                    type: 'string',
                    description:
                      'the name of the model that will be used to generate the image, can be dall-e-2 or dall-e-3 or gpt-image-1 or any other valid model name. If no tool is specified, a default is used',
                    default: 'gpt-image-1',
                  },
                }),
          },
          additionalProperties: false,
          required: ['prompt'],
        },
        invoke: this.invokeGenerate.bind(this),
      },
    }
    if (!this.forcedModel || this.forcedModel == 'gpt-image-1') {
      this.functions['EditImage'] = {
        description:
          'Modify user provided images using instruction provided by the user. Look in chat context to find uploaded or generated images',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'textual description of the modification to apport to the image(s)',
            },
            ...(this.forcedModel
              ? {}
              : {
                  model: {
                    type: 'string',
                    description:
                      'the name of the model that will be used to generate the image, can be gpt-image-1 or any other valid model name. If no tool is specified, a default is used',
                    default: 'gpt-image-1',
                  },
                }),
            fileId: {
              type: 'array',
              description: 'Array of image IDs to edit',
              items: {
                type: 'string',
                description: 'ID of a single image',
              },
              minItems: 1,
            },
          },
          additionalProperties: false,
          required: ['prompt', 'fileId'],
        },
        invoke: this.invokeEdit.bind(this),
      }
    }
  }

  private async invokeGenerate({ params: invocationParams, uiLink }: ToolInvokeParams) {
    const openai = new OpenAI({
      apiKey: this.provisioned ? expandEnv(this.params.apiKey) : this.params.apiKey,
      baseURL: env.logicleCloud.images.proxyBaseUrl,
    })
    const model =
      this.forcedModel ?? (invocationParams.model as string | undefined) ?? 'gpt-image-1'
    const aiResponse = await openai.images.generate({
      prompt: '' + invocationParams.prompt,
      model: model,
      n: 1,
      size: '1024x1024',
      //quality: 'standard',
      response_format: get_response_format_parameter(model),
    })
    return await this.handleResponse(aiResponse, uiLink)
  }

  private async loadImageAsWebFile(fileId: string) {
    const fileEntry = await getFileWithId(fileId)
    if (!fileEntry) {
      throw new Error(`Tool invocation required non existing file: ${fileId}`)
    }
    const fileContent = await storage.readBuffer(fileEntry.path, fileEntry.encrypted ? true : false)
    const blob = new Blob([fileContent], { type: fileEntry.type })
    return new File([blob], 'upload.png', { type: fileEntry.type })
  }

  private async invokeEdit({ params: invocationParams, uiLink }: ToolInvokeParams) {
    const openai = new OpenAI({
      apiKey: this.provisioned ? expandEnv(this.params.apiKey) : this.params.apiKey,
      baseURL: env.logicleCloud.images.proxyBaseUrl,
    })
    const model =
      this.forcedModel ?? (invocationParams.model as string | undefined) ?? 'gpt-image-1'
    const fileIds = invocationParams['fileId'] as string[]
    const files = await Promise.all(
      fileIds.map((fileId) => {
        return this.loadImageAsWebFile(fileId)
      })
    )
    const aiResponse = await openai.images.edit({
      image: files,
      prompt: '' + invocationParams.prompt,
      model: model,
      n: 1,
      size: '1024x1024',
      //quality: 'standard',
      response_format: get_response_format_parameter(model),
    })
    return await this.handleResponse(aiResponse, uiLink)
  }

  async handleResponse(aiResponse: ImagesResponse, uiLink: ToolUILink) {
    const responseData = aiResponse.data ?? []
    if (responseData.length == 0) {
      throw new Error('Unexpected response from OpenAI')
    }
    for (const img of responseData) {
      if (!img.b64_json) {
        throw new Error('Unexpected response from OpenAI')
      }
      const imgBinaryData = Buffer.from(img.b64_json, 'base64')
      const id = nanoid()
      const name = `${id}.png`
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
    }
    return `The tool displayed ${responseData.length} images. The images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the ChatGPT UI already. Do not mention anything about visualizing / downloading to the user.`
  }
}

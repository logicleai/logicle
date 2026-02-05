import {
  ToolImplementation,
  ToolBuilder,
  ToolInvokeParams,
  ToolParams,
  ToolFunctions,
  ToolFunctionContext,
} from '@/lib/chat/tools'
import * as dto from '@/types/dto'
import { ImageGeneratorPluginInterface, ImageGeneratorPluginParams } from './interface'
import OpenAI from 'openai'
import { addFile, getFileWithId } from '@/models/file'
import { nanoid } from 'nanoid'
import { InsertableFile } from '@/types/dto/file'
import env from '@/lib/env'
import { expandToolParameter } from '@/lib/tools/configSecrets'
import { storage } from '@/lib/storage'
import { ImagesResponse } from 'openai/resources/images'
import { ensureABView } from '@/lib/utils'
import { LlmModel } from '@/lib/chat/models'

function get_response_format_parameter(model: string) {
  if (model === 'gpt-image-1') {
    return undefined
  } else {
    return 'b64_json'
  }
}

export class ImageGeneratorPlugin
  extends ImageGeneratorPluginInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new ImageGeneratorPlugin(toolParams, params as unknown as ImageGeneratorPluginParams)
  model: string
  supportedMedia = []
  functions_: ToolFunctions
  constructor(
    public toolParams: ToolParams,
    private params: ImageGeneratorPluginParams
  ) {
    super()
    this.model = params.model ?? 'gpt-image-1'
    this.functions_ = {
      GenerateImage: {
        description: 'Generate one or more images from a textual description',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'textual description of the image(s) to generate',
            },
          },
          additionalProperties: false,
          required: ['prompt'],
        },
        invoke: this.invokeGenerate.bind(this),
      },
    }
    if (this.params.supportsEditing) {
      this.functions_.EditImage = {
        description:
          'Modify user provided images using instruction provided by the user. Look in chat context to find uploaded or generated images',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'textual description of the modification to apport to the image(s)',
            },
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

  functions = async (_model: LlmModel, _context?: ToolFunctionContext) => this.functions_

  private async invokeGenerate({
    params: invocationParams,
  }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const apiKey = await expandToolParameter(this.toolParams, this.params.apiKey)
    const openai = new OpenAI({
      apiKey,
      baseURL: env.tools.imagegen.proxyBaseUrl,
    })
    const model = this.model
    const aiResponse = await openai.images.generate({
      prompt: `${invocationParams.prompt}`,
      model: model,
      n: 1,
      size: '1024x1024',
      //quality: 'standard',
      response_format: get_response_format_parameter(model),
    })
    return await this.handleResponse(aiResponse)
  }

  private async loadImageAsWebFile(fileId: string) {
    const fileEntry = await getFileWithId(fileId)
    if (!fileEntry) {
      throw new Error(`Tool invocation required non existing file: ${fileId}`)
    }
    // FIXME: doing an unsafe cast. There should be no problems with node
    const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
    const blob = new Blob([ensureABView(fileContent)], { type: fileEntry.type })
    return new File([blob], 'upload.png', { type: fileEntry.type })
  }

  private async invokeEdit({ params: invocationParams }: ToolInvokeParams) {
    const apiKey = await expandToolParameter(this.toolParams, this.params.apiKey)
    const openai = new OpenAI({
      apiKey,
      baseURL: env.tools.imagegen.proxyBaseUrl,
    })
    const fileIds = invocationParams.fileId as string[]
    const files = await Promise.all(
      fileIds.map((fileId) => {
        return this.loadImageAsWebFile(fileId)
      })
    )
    const aiResponse = await openai.images.edit({
      image: files,
      prompt: `${invocationParams.prompt}`,
      model: this.model,
      n: 1,
      size: '1024x1024',
      //quality: 'standard',
      response_format: get_response_format_parameter(this.model),
    })
    return await this.handleResponse(aiResponse)
  }

  async handleResponse(aiResponse: ImagesResponse) {
    const responseData = aiResponse.data ?? []
    if (responseData.length === 0) {
      throw new Error('Unexpected response from OpenAI')
    }
    const result: dto.ToolCallResultOutput = {
      type: 'content',
      value: [
        {
          type: 'text',
          text: `The tool displayed ${responseData.length} images. The images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the ChatGPT UI already. Do not mention anything about visualizing / downloading to the user.`,
        },
      ],
    }
    for (const img of responseData) {
      if (!img.b64_json) {
        throw new Error('Unexpected response from OpenAI')
      }
      const imgBinaryData = Buffer.from(img.b64_json, 'base64')
      const name = `${nanoid()}.png`
      const path = name
      await storage.writeBuffer(name, imgBinaryData, env.fileStorage.encryptFiles)
      const mimeType = 'image/png'
      const dbEntry: InsertableFile = {
        name,
        type: mimeType,
        size: imgBinaryData.byteLength,
      }
      const dbFile = await addFile(dbEntry, path, env.fileStorage.encryptFiles)
      result.value.push({
        type: 'file' as const,
        id: dbFile.id,
        mimetype: 'image/png',
        size: imgBinaryData.byteLength,
        name: name,
      })
    }
    return result
  }
}

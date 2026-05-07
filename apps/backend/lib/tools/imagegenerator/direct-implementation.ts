import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import * as dto from '@/types/dto'
import { getFileWithId } from '@/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { nanoid } from 'nanoid'
import { expandToolParameter } from '@/backend/lib/tools/configSecrets'
import { storage } from '@/lib/storage'
import { ensureABView } from '@/backend/lib/utils'
import { LlmModel } from '@/lib/chat/models'
import { editWithGemini, generateWithGemini } from '@/backend/lib/imagegen/providers/gemini'
import { generateWithImagen } from '@/backend/lib/imagegen/providers/imagen'
import { editWithOpenAI, generateWithOpenAI } from '@/backend/lib/imagegen/providers/openai'
import { generateWithReplicate } from '@/backend/lib/imagegen/providers/replicate'
import { editWithTogether, generateWithTogether } from '@/backend/lib/imagegen/providers/together'
import { recordImageGenerationEvent } from '@/backend/lib/imagegen/metering'
import {
  generatedImageExtensionForMimeType,
  normalizeGeneratedImageMimeType,
} from '@/backend/lib/imagegen/files'
import {
  isGeminiImageModel,
  isImageEditingSupportedModel,
  isImagenImageModel,
  isOpenAiImageModel,
  shouldExposeImageEditingTool,
  isTogetherImageModel,
} from '@/backend/lib/imagegen/models'
import {
  GeneratedImagesResponse,
  ImageEditRequest,
  ImageGenerationRequest,
} from '@/backend/lib/imagegen/types'
import { materializeFile } from '@/backend/lib/files/materialize'
import { resolveFileOwner } from '@/backend/lib/tools/ownership'
import {
  DirectImageGeneratorPluginParams,
  ReplicateImageGeneratorPluginParams,
} from '@/lib/tools/schemas'

const IMAGE_TOOL_TEXT =
  "The tool displayed generated images. The images are already plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the ChatGPT UI already. Do not mention anything about visualizing / downloading to the user."
const SUPPORTED_IMAGE_SIZES = ['auto', '1024x1024', '1024x1536', '1536x1024'] as const
const SUPPORTED_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const

type SupportedImageSize = (typeof SUPPORTED_IMAGE_SIZES)[number]
type SupportedImageAspectRatio = (typeof SUPPORTED_IMAGE_ASPECT_RATIOS)[number]

const normalizeRequestedSize = (value: unknown): SupportedImageSize => {
  if (typeof value === 'string' && SUPPORTED_IMAGE_SIZES.includes(value as SupportedImageSize)) {
    return value as SupportedImageSize
  }
  return '1024x1024'
}

const normalizeRequestedAspectRatio = (value: unknown): SupportedImageAspectRatio | undefined => {
  if (
    typeof value === 'string' &&
    SUPPORTED_IMAGE_ASPECT_RATIOS.includes(value as SupportedImageAspectRatio)
  ) {
    return value as SupportedImageAspectRatio
  }
  return undefined
}

type DirectImageToolParams = {
  apiKey: string
  model: string
}

abstract class DirectImageGeneratorPlugin implements ToolImplementation {
  static builder: ToolBuilder
  supportedMedia = []
  model: string
  functions_: ToolFunctions

  constructor(
    public toolParams: ToolParams,
    protected params: DirectImageToolParams
  ) {
    this.model = params.model ?? 'gpt-image-1'
    this.assertSupportedModel()
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
            ...this.buildSizeProperty(),
            ...this.buildAspectRatioProperty(),
          },
          additionalProperties: false,
          required: ['prompt'],
        },
        invoke: this.invokeGenerate.bind(this),
      },
    }

    if (shouldExposeImageEditingTool(this.model)) {
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
            ...this.buildSizeProperty(),
            ...this.buildAspectRatioProperty(),
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

  functions = async (_model: LlmModel, _context: ToolFunctionContext) => this.functions_

  protected abstract supportsModel(model: string): boolean
  protected abstract supportsSizeControl(model: string): boolean
  protected abstract supportsAspectRatioControl(model: string): boolean
  protected abstract providerName(): string
  protected abstract generateDirect(request: ImageGenerationRequest): Promise<GeneratedImagesResponse>
  protected abstract editDirect(request: ImageEditRequest): Promise<GeneratedImagesResponse>

  private assertSupportedModel() {
    if (!this.supportsModel(this.model)) {
      throw new Error(`Model "${this.model}" is not supported by tool "${this.toolParams.name}"`)
    }
  }

  private buildSizeProperty(): Record<string, unknown> {
    if (!this.supportsSizeControl(this.model)) {
      return {}
    }
    return {
      size: {
        type: 'string',
        enum: [...SUPPORTED_IMAGE_SIZES],
        description:
          'Optional output size. Use portrait (`1024x1536`) or landscape (`1536x1024`) to control aspect ratio.',
      },
    }
  }

  private buildAspectRatioProperty(): Record<string, unknown> {
    if (!this.supportsAspectRatioControl(this.model)) {
      return {}
    }
    return {
      aspectRatio: {
        type: 'string',
        enum: [...SUPPORTED_IMAGE_ASPECT_RATIOS],
        description: 'Optional output aspect ratio.',
      },
    }
  }

  private assertImageResponse(response: GeneratedImagesResponse) {
    if (response.data.length === 0 || response.data.some((item) => !item.b64_json)) {
      throw new Error('Image provider returned no image data')
    }
    return response
  }

  private async invokeGenerate({
    params: invocationParams,
    conversationId,
    userId,
    assistantId,
    rootOwner,
  }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const apiKey = await expandToolParameter(this.toolParams, this.params.apiKey)
    const size = this.supportsSizeControl(this.model)
      ? normalizeRequestedSize(invocationParams.size)
      : undefined
    const aspectRatio = this.supportsAspectRatioControl(this.model)
      ? normalizeRequestedAspectRatio(invocationParams.aspectRatio)
      : undefined
    const aiResponse = this.assertImageResponse(
      await this.generateDirect({
        apiKey,
        model: this.model,
        prompt: `${invocationParams.prompt}`,
        n: 1,
        size,
        aspectRatio,
      })
    )
    await recordImageGenerationEvent({
      provider: this.providerName(),
      model: this.model,
      operation: 'generate',
      toolId: this.toolParams.id,
      toolName: this.toolParams.name,
      userId: typeof invocationParams.userId === 'string' ? invocationParams.userId : undefined,
    })
    return await this.handleResponse(aiResponse, {
      conversationId,
      userId,
      assistantId,
      rootOwner,
    })
  }

  private async loadImage(fileId: string, userId: string) {
    if (!(await canAccessFile({ userId }, fileId))) {
      throw new Error(`Tool invocation unauthorized for file: ${fileId}`)
    }
    const fileEntry = await getFileWithId(fileId)
    if (!fileEntry) {
      throw new Error(`Tool invocation required non existing file: ${fileId}`)
    }
    const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
    return {
      data: Buffer.from(ensureABView(fileContent)),
      fileName: fileEntry.name || 'upload.png',
      mimeType: fileEntry.type,
    }
  }

  private async invokeEdit({
    params: invocationParams,
    conversationId,
    userId,
    assistantId,
    rootOwner,
  }: ToolInvokeParams) {
    if (!isImageEditingSupportedModel(this.model)) {
      throw new Error(`Image editing is not supported for model: ${this.model}`)
    }
    const apiKey = await expandToolParameter(this.toolParams, this.params.apiKey)
    const size = this.supportsSizeControl(this.model)
      ? normalizeRequestedSize(invocationParams.size)
      : undefined
    const aspectRatio = this.supportsAspectRatioControl(this.model)
      ? normalizeRequestedAspectRatio(invocationParams.aspectRatio)
      : undefined
    const fileIds = invocationParams.fileId as string[]
    const files = await Promise.all(fileIds.map((fileId) => this.loadImage(fileId, userId)))
    const aiResponse = this.assertImageResponse(
      await this.editDirect({
        apiKey,
        model: this.model,
        prompt: `${invocationParams.prompt}`,
        images: files,
        n: 1,
        size,
        aspectRatio,
      })
    )
    await recordImageGenerationEvent({
      provider: this.providerName(),
      model: this.model,
      operation: 'edit',
      toolId: this.toolParams.id,
      toolName: this.toolParams.name,
      userId: typeof invocationParams.userId === 'string' ? invocationParams.userId : undefined,
    })
    return await this.handleResponse(aiResponse, {
      conversationId,
      userId,
      assistantId,
      rootOwner,
    })
  }

  protected async handleResponse(
    aiResponse: GeneratedImagesResponse,
    ownerContext: {
      conversationId?: string
      userId: string
      assistantId: string
      rootOwner?: { type: 'CHAT' | 'USER' | 'ASSISTANT'; id: string }
    }
  ) {
    const responseData = aiResponse.data ?? []
    if (responseData.length === 0) {
      throw new Error('Image provider returned no images')
    }

    const result: dto.ToolCallResultOutput = {
      type: 'content',
      value: [{ type: 'text', text: IMAGE_TOOL_TEXT }],
    }

    for (const img of responseData) {
      if (!img.b64_json) {
        throw new Error('Image provider returned invalid image data')
      }
      const imgBinaryData = Buffer.from(img.b64_json, 'base64')
      const mimeType = normalizeGeneratedImageMimeType(img.mimeType)
      const name = `${nanoid()}.${generatedImageExtensionForMimeType(mimeType)}`
      const dbFile = await materializeFile({
        content: imgBinaryData,
        name,
        mimeType,
        owner: resolveFileOwner(ownerContext),
      })
      result.value.push({
        type: 'file',
        id: dbFile.id,
        mimetype: mimeType,
        size: imgBinaryData.byteLength,
        name,
      })
    }

    return result
  }
}

export class OpenAiImageGeneratorPlugin extends DirectImageGeneratorPlugin {
  static toolName = 'imagegen.openai'
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new OpenAiImageGeneratorPlugin(toolParams, params as DirectImageGeneratorPluginParams)

  constructor(toolParams: ToolParams, params: DirectImageGeneratorPluginParams) {
    super(toolParams, params)
  }

  protected providerName() {
    return 'openai'
  }

  protected supportsModel(model: string) {
    return isOpenAiImageModel(model)
  }

  protected supportsSizeControl() {
    return true
  }

  protected supportsAspectRatioControl() {
    return false
  }

  protected generateDirect(request: ImageGenerationRequest) {
    return generateWithOpenAI(request)
  }

  protected editDirect(request: ImageEditRequest) {
    return editWithOpenAI(request)
  }
}

export class GoogleImageGeneratorPlugin extends DirectImageGeneratorPlugin {
  static toolName = 'imagegen.google'
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new GoogleImageGeneratorPlugin(toolParams, params as DirectImageGeneratorPluginParams)

  constructor(toolParams: ToolParams, params: DirectImageGeneratorPluginParams) {
    super(toolParams, params)
  }

  protected providerName() {
    return isImagenImageModel(this.model) ? 'imagen' : 'gemini'
  }

  protected supportsModel(model: string) {
    return isGeminiImageModel(model) || isImagenImageModel(model)
  }

  protected supportsSizeControl() {
    return false
  }

  protected supportsAspectRatioControl() {
    return true
  }

  protected generateDirect(request: ImageGenerationRequest) {
    if (isGeminiImageModel(request.model)) {
      return generateWithGemini(request)
    }
    if (isImagenImageModel(request.model)) {
      return generateWithImagen(request)
    }
    throw new Error(`Unsupported Google image model: ${request.model}`)
  }

  protected editDirect(request: ImageEditRequest) {
    if (isGeminiImageModel(request.model)) {
      return editWithGemini(request)
    }
    throw new Error(`Image editing is not supported for model: ${request.model}`)
  }
}

export class TogetherImageGeneratorPlugin extends DirectImageGeneratorPlugin {
  static toolName = 'imagegen.together'
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new TogetherImageGeneratorPlugin(toolParams, params as DirectImageGeneratorPluginParams)

  constructor(toolParams: ToolParams, params: DirectImageGeneratorPluginParams) {
    super(toolParams, params)
  }

  protected providerName() {
    return 'together'
  }

  protected supportsModel(model: string) {
    return isTogetherImageModel(model)
  }

  protected supportsSizeControl() {
    return true
  }

  protected supportsAspectRatioControl() {
    return false
  }

  protected generateDirect(request: ImageGenerationRequest) {
    return generateWithTogether(request)
  }

  protected editDirect(request: ImageEditRequest) {
    return editWithTogether(request)
  }
}

export class ReplicateImageGeneratorPlugin extends DirectImageGeneratorPlugin {
  static toolName = 'imagegen.replicate'
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new ReplicateImageGeneratorPlugin(toolParams, params as ReplicateImageGeneratorPluginParams)

  constructor(
    toolParams: ToolParams,
    private replicateParams: ReplicateImageGeneratorPluginParams
  ) {
    super(toolParams, replicateParams)
  }

  protected providerName() {
    return 'replicate'
  }

  protected supportsModel(_model: string) {
    return true
  }

  protected supportsSizeControl() {
    return false
  }

  protected supportsAspectRatioControl() {
    return false
  }

  protected generateDirect(request: ImageGenerationRequest) {
    return generateWithReplicate({
      ...request,
      input: this.replicateParams.input,
    })
  }

  protected async editDirect(request: ImageEditRequest): Promise<GeneratedImagesResponse> {
    throw new Error(`Image editing is not supported for model: ${request.model}`)
  }
}

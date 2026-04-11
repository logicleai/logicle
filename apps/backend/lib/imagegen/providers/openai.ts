import OpenAI from 'openai'
import { logger } from '@/lib/logging'
import { GeneratedImagesResponse, ImageEditRequest, ImageGenerationRequest } from '../types'

const getResponseFormat = (model: string): 'b64_json' | undefined => {
  if (model === 'gpt-image-1') {
    return undefined
  }
  return 'b64_json'
}

const getSize = (
  size?: string
): '1024x1024' | '1024x1536' | '1536x1024' | '256x256' | '512x512' | 'auto' => {
  switch (size) {
    case '1024x1536':
    case '1536x1024':
    case '256x256':
    case '512x512':
    case 'auto':
      return size
    default:
      return '1024x1024'
  }
}

export const generateWithOpenAI = async ({
  apiKey,
  model,
  prompt,
  n,
  size,
}: ImageGenerationRequest): Promise<GeneratedImagesResponse> => {
  const client = new OpenAI({ apiKey })
  const response = await client.images.generate({
    model,
    prompt,
    n: n ?? 1,
    size: getSize(size),
    response_format: getResponseFormat(model),
  })

  logger.info('Generated image directly via OpenAI', { model })
  return {
    created: Math.floor(Date.now() / 1000),
    data: (response.data ?? []).flatMap((item) => {
      if (!item.b64_json) {
        return []
      }
      return [{ b64_json: item.b64_json }]
    }),
  }
}

export const editWithOpenAI = async ({
  apiKey,
  model,
  prompt,
  n,
  size,
  images,
}: ImageEditRequest): Promise<GeneratedImagesResponse> => {
  const client = new OpenAI({ apiKey })
  const uploadImages = images.map(
    (image) =>
      new File([new Blob([Uint8Array.from(image.data)], { type: image.mimeType })], image.fileName, {
        type: image.mimeType,
      })
  )
  const response = await client.images.edit({
    model,
    prompt,
    image: uploadImages,
    n: n ?? 1,
    size: getSize(size),
    response_format: getResponseFormat(model),
  })

  logger.info('Edited image directly via OpenAI', { model, imageCount: images.length })
  return {
    created: Math.floor(Date.now() / 1000),
    data: (response.data ?? []).flatMap((item) => {
      if (!item.b64_json) {
        return []
      }
      return [{ b64_json: item.b64_json }]
    }),
  }
}

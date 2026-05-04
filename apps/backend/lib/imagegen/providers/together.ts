import { Together } from 'together-ai'
import { logger } from '@/lib/logging'
import { GeneratedImagesResponse, ImageEditRequest, ImageGenerationRequest } from '../types'

const createTogetherClient = (apiKey: string) => new Together({ apiKey })

const getTogetherModel = (model: string) => `black-forest-labs/${model}`

const getTogetherSize = (size?: string): { width: number; height: number } => {
  const matched = size?.match(/^(\d+)x(\d+)$/)
  if (!matched) {
    return { width: 1024, height: 1024 }
  }
  return { width: Number(matched[1]), height: Number(matched[2]) }
}

export const generateWithTogether = async ({
  apiKey,
  model,
  prompt,
  n,
  size,
}: ImageGenerationRequest): Promise<GeneratedImagesResponse> => {
  const client = createTogetherClient(apiKey)
  const dimensions = getTogetherSize(size)
  const response = await client.images.generate({
    model: getTogetherModel(model),
    prompt,
    width: dimensions.width,
    height: dimensions.height,
    steps: 20,
    n: n ?? 1,
    response_format: 'base64',
    output_format: 'png',
  })

  logger.info('Generated image directly via Together', { model })
  return {
    created: Math.floor(Date.now() / 1000),
    data: (response.data ?? []).flatMap((item) => {
      if (!item.b64_json) {
        return []
      }
      return [{ b64_json: item.b64_json, mimeType: 'image/png' }]
    }),
  }
}

export const editWithTogether = async ({
  apiKey,
  model,
  prompt,
  n,
  images,
  size,
}: ImageEditRequest): Promise<GeneratedImagesResponse> => {
  const client = createTogetherClient(apiKey)
  const sourceImage = images[0]
  const dimensions = getTogetherSize(size)
  const imageUrl = `data:${sourceImage.mimeType};base64,${sourceImage.data.toString('base64')}`
  const response = await client.images.generate({
    model: getTogetherModel(model),
    prompt,
    image_url: imageUrl,
    width: dimensions.width,
    height: dimensions.height,
    steps: 20,
    n: n ?? 1,
    response_format: 'base64',
    output_format: 'png',
  })

  logger.info('Edited image directly via Together', { model })
  return {
    created: Math.floor(Date.now() / 1000),
    data: (response.data ?? []).flatMap((item) => {
      if (!item.b64_json) {
        return []
      }
      return [{ b64_json: item.b64_json, mimeType: 'image/png' }]
    }),
  }
}

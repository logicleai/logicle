import { GoogleGenAI } from '@google/genai'
import { logger } from '@/lib/logging'
import { GeneratedImagesResponse, ImageGenerationRequest } from '../types'

export const generateWithImagen = async ({
  apiKey,
  model,
  prompt,
  n,
}: ImageGenerationRequest): Promise<GeneratedImagesResponse> => {
  const client = new GoogleGenAI({ apiKey })
  const response = await client.models.generateImages({
    model,
    prompt,
    config: {
      numberOfImages: n ?? 1,
    },
  })

  const data = (response.generatedImages ?? []).flatMap((generatedImage) => {
    const image = generatedImage.image?.imageBytes
    if (!image) {
      return []
    }
    return [{ b64_json: image }]
  })
  if (data.length === 0) {
    throw new Error('No image data received from Imagen')
  }

  logger.info('Generated image directly via Imagen', { model, count: data.length })
  return {
    created: Math.floor(Date.now() / 1000),
    data,
  }
}

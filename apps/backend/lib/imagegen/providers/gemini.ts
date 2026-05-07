import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from '@/lib/logging'
import { GeneratedImagesResponse, ImageEditRequest, ImageGenerationRequest } from '../types'

const createGeminiClient = (apiKey: string) => new GoogleGenerativeAI(apiKey)

type GeminiInlineImagePart = {
  inlineData?: {
    data?: string
    mimeType?: string
  }
}

const extractGeminiImage = (parts: GeminiInlineImagePart[] = []) => {
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
      }
    }
  }
  return undefined
}

export const generateWithGemini = async ({
  apiKey,
  model,
  prompt,
  aspectRatio,
}: ImageGenerationRequest): Promise<GeneratedImagesResponse> => {
  const client = createGeminiClient(apiKey)
  const geminiModel = client.getGenerativeModel({ model })
  const result = await geminiModel.generateContentStream({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      ...(aspectRatio
        ? ({
            imageConfig: {
              aspectRatio,
            },
          } as const)
        : {}),
    } as never,
  } as never)

  let image: { data: string; mimeType?: string } | undefined
  for await (const chunk of result.stream) {
    image = extractGeminiImage(
      (chunk.candidates?.[0]?.content?.parts as GeminiInlineImagePart[]) ?? []
    )
    if (image) {
      break
    }
  }

  if (!image) {
    throw new Error('No image data received from Gemini')
  }

  logger.info('Generated image directly via Gemini', { model })
  return {
    created: Math.floor(Date.now() / 1000),
    data: [{ b64_json: image.data, mimeType: image.mimeType }],
  }
}

export const editWithGemini = async ({
  apiKey,
  model,
  prompt,
  images,
  aspectRatio,
}: ImageEditRequest): Promise<GeneratedImagesResponse> => {
  const client = createGeminiClient(apiKey)
  const geminiModel = client.getGenerativeModel({ model })
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
    ...images.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data.toString('base64'),
      },
    })),
  ]

  const result = await geminiModel.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      ...(aspectRatio
        ? ({
            imageConfig: {
              aspectRatio,
            },
          } as const)
        : {}),
    } as never,
  } as never)

  const image = extractGeminiImage(
    (result.response.candidates?.[0]?.content?.parts as GeminiInlineImagePart[]) ?? []
  )
  if (!image) {
    throw new Error('No image data received from Gemini')
  }

  logger.info('Edited image directly via Gemini', { model, imageCount: images.length })
  return {
    created: Math.floor(Date.now() / 1000),
    data: [{ b64_json: image.data, mimeType: image.mimeType }],
  }
}

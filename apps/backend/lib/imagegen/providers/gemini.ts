import { GoogleGenerativeAI } from '@google/generative-ai'
import { logger } from '@/lib/logging'
import { GeneratedImagesResponse, ImageEditRequest, ImageGenerationRequest } from '../types'

const createGeminiClient = (apiKey: string) => new GoogleGenerativeAI(apiKey)

const extractGeminiImage = (parts: Array<{ inlineData?: { data?: string } }> = []) => {
  for (const part of parts) {
    if (part.inlineData?.data) {
      return part.inlineData.data
    }
  }
  return ''
}

export const generateWithGemini = async ({
  apiKey,
  model,
  prompt,
}: ImageGenerationRequest): Promise<GeneratedImagesResponse> => {
  const client = createGeminiClient(apiKey)
  const geminiModel = client.getGenerativeModel({ model })
  const result = await geminiModel.generateContentStream({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    } as never,
  } as never)

  let image = ''
  for await (const chunk of result.stream) {
    image = extractGeminiImage(
      (chunk.candidates?.[0]?.content?.parts as Array<{ inlineData?: { data?: string } }>) ?? []
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
    data: [{ b64_json: image }],
  }
}

export const editWithGemini = async ({
  apiKey,
  model,
  prompt,
  images,
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
    } as never,
  } as never)

  const image = extractGeminiImage(
    (result.response.candidates?.[0]?.content?.parts as Array<{ inlineData?: { data?: string } }>) ??
      []
  )
  if (!image) {
    throw new Error('No image data received from Gemini')
  }

  logger.info('Edited image directly via Gemini', { model, imageCount: images.length })
  return {
    created: Math.floor(Date.now() / 1000),
    data: [{ b64_json: image }],
  }
}

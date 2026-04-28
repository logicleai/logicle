import Replicate from 'replicate'
import { logger } from '@/lib/logging'
import { GeneratedImagesResponse, ImageGenerationRequest } from '../types'

const downloadAsBase64 = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed downloading generated image: ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return {
    b64_json: bytes.toString('base64'),
    mimeType: response.headers.get('content-type') ?? undefined,
  }
}

export const generateWithReplicate = async ({
  apiKey,
  model,
  prompt,
  input,
}: ImageGenerationRequest): Promise<GeneratedImagesResponse> => {
  const replicate = new Replicate({ auth: apiKey })
  const prediction = await replicate.predictions.create({
    version: model,
    input: { ...(input ?? {}), prompt },
  })
  const completed = await replicate.wait(prediction)
  const output = Array.isArray(completed.output) ? completed.output[0] : null
  if (typeof output !== 'string') {
    throw new Error('Replicate did not return an image URL')
  }

  logger.info('Generated image directly via Replicate', { model })
  return {
    created: Math.floor(Date.now() / 1000),
    data: [await downloadAsBase64(output)],
  }
}

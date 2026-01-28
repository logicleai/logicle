import * as z from 'zod'

export const ImageGeneratorModels = [
  'dall-e-2',
  'dall-e-3',
  'gpt-image-1',
  'gemini-2.5-flash-image',
  'FLUX.1-kontext-max',
] as const

export type Model = (typeof ImageGeneratorModels)[number]

export interface ImageGeneratorPluginParams {
  apiKey: string
  model: Model | string
  canEdit: boolean
}

export const ImageGeneratorSchema = z.object({
  apiKey: z.string(),
  model: z.string(),
  canEdit: z.boolean(),
})

export class ImageGeneratorPluginInterface {
  static toolName: string = 'dall-e'
}

import * as z from 'zod'

export const ImageGeneratorSchema = z.object({
  apiKey: z.string(),
  model: z.string(),
  supportsEditing: z.boolean().default(false),
})

export type ImageGeneratorPluginParams = z.infer<typeof ImageGeneratorSchema>

export class ImageGeneratorPluginInterface {
  static toolName: string = 'dall-e'
}

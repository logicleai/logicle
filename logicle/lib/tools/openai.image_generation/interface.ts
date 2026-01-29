import * as z from 'zod'

export const OpenAiImageGenerationSchema = z.object({}).strict()

export type OpenAiImageGenerationParams = z.infer<typeof OpenAiImageGenerationSchema>

export class OpenAiImageGenerationInterface {
  static toolName: string = 'openai.image_generation'
}

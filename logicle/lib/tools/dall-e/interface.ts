import * as z from 'zod'

export const Dall_eModels = ['dall-e-2', 'dall-e-3', 'gpt-image-1'] as const

export type Model = (typeof Dall_eModels)[number]

export interface Dall_ePluginParams {
  apiKey: string
  model?: Model
}

export const Dall_eSchema = z.object({
  apiKey: z.string(),
  model: z.enum(Dall_eModels),
})

export class Dall_ePluginInterface {
  static toolName: string = 'dall-e'
}

export type Model = 'dall-e-2' | 'dall-e-3' | 'gpt-image-1'

export interface Dall_ePluginParams {
  apiKey: string
  model?: Model
}

export class Dall_ePluginInterface {
  static toolName: string = 'dall-e'
}

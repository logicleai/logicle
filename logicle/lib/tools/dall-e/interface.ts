import { ToolType } from '../tools'

export interface Dall_ePluginParams {
  apiKey: string
}

export class Dall_ePluginInterface {
  static toolName: ToolType = 'dall-e'
}

import { ToolType } from '../tools'

export interface OpenApiParams {
  spec: string
}

export class OpenApiInterface {
  static toolName: ToolType = 'openapi'
}

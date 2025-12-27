import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { GoogleWebSearchInterface } from './interface'
import { LlmModel } from '@/lib/chat/models'

export class GoogleWebSearch extends GoogleWebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new GoogleWebSearch(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  isModelSupported(model: LlmModel): boolean {
    return model.provider === 'logiclecloud' && model.owned_by === 'google'
  }

  async functions(): Promise<ToolFunctions> {
    return {
      google_search: {
        type: 'provider',
        id: 'google.google_search',
        args: {},
      },
    }
  }
}

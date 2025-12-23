import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { GoogleWebSearchInterface } from './interface'

export class GoogleWebSearch extends GoogleWebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new GoogleWebSearch(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
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

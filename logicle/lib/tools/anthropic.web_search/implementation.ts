import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { AnthropicWebSearchInterface } from './interface'

export class AnthropicWebSearch extends AnthropicWebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new AnthropicWebSearch(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  async functions(): Promise<ToolFunctions> {
    return {
      web_search: {
        type: 'provider',
        id: 'anthropic.web_search_20250305',
        args: {},
      },
    }
  }
}

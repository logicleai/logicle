import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { AnthropicWebSearchInterface, AnthropicWebSearchParams } from './interface'

export class AnthropicWebSearch extends AnthropicWebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new AnthropicWebSearch(toolParams, params as unknown as AnthropicWebSearchParams)
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    private params: AnthropicWebSearchParams
  ) {
    super()
  }

  async functions(): Promise<ToolFunctions> {
    return {
      web_search: {
        type: 'provider-defined',
        id: 'anthropic.web_search_20250305',
        args: {},
      },
    }
  }
}

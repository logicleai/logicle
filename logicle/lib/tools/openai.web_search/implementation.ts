import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { OpenAiWebSearchInterface, OpenAiWebSearchParams } from './interface'

export class OpenaiWebSearch extends OpenAiWebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new OpenaiWebSearch(toolParams, params as unknown as OpenAiWebSearchParams)
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    private params: OpenAiWebSearchParams
  ) {
    super()
  }

  async functions(): Promise<ToolFunctions> {
    return {
      web_search_preview: {
        type: 'provider-defined',
        id: 'openai.web_search_preview',
        args: {},
      },
    }
  }
}

import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { OpenAiWebSearchInterface } from './interface'

export class OpenaiWebSearch extends OpenAiWebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new OpenaiWebSearch(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
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

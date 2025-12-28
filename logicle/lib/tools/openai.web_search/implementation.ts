import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { OpenAiWebSearchInterface } from './interface'
import { LlmModel } from '@/lib/chat/models'

export class OpenaiWebSearch extends OpenAiWebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new OpenaiWebSearch(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  isModelSupported(model: LlmModel): boolean {
    return model.provider === 'openai'
  }

  async functions(): Promise<ToolFunctions> {
    return {
      web_search: {
        type: 'provider',
        id: 'openai.web_search',
        args: {},
      },
    }
  }
}

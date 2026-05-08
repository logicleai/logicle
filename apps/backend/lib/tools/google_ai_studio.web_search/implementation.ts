import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { GoogleAiStudioWebSearchInterface } from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'

export class GoogleAiStudioWebSearch
  extends GoogleAiStudioWebSearchInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams) => new GoogleAiStudioWebSearch(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  isModelSupported(model: LlmModel): boolean {
    return (
      model.provider === 'google-ai-studio' &&
      model.owned_by === 'google' &&
      model.capabilities.web_search === true
    )
  }

  async functions(_model: LlmModel, _context: ToolFunctionContext): Promise<ToolFunctions> {
    return {
      google_search: {
        type: 'provider',
        id: 'google.google_search',
        args: {},
      },
    }
  }
}

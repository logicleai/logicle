import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { GoogleAiStudioWebSearchInterface } from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'

const NATIVE_SEARCH: ToolFunctions = {
  google_search: { type: 'provider', id: 'google.google_search', args: {} },
}

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
    return NATIVE_SEARCH
  }

  resolveForToolSet(allFunctions: ToolFunctions, _model: LlmModel) {
    // Gemini rejects requests that mix provider-defined tools with function tools.
    // When other function tools are present, fall back to search grounding instead.
    const hasRegularFunctions = Object.values(allFunctions).some((f) => f.type !== 'provider')
    if (hasRegularFunctions) {
      return { functions: {}, providerOptions: { google: { useSearchGrounding: true } } }
    }
    return { functions: NATIVE_SEARCH }
  }
}

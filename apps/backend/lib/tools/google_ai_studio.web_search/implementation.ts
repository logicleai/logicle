import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { GoogleAiStudioWebSearchInterface } from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'
import { SharedV2ProviderOptions } from '@ai-sdk/provider'

export class GoogleAiStudioWebSearch
  extends GoogleAiStudioWebSearchInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams) => new GoogleAiStudioWebSearch(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  // Google native search (googleSearch tool) is only compatible with Gemini 3.0+.
  // Earlier models do not support mixing function tools with built-in tools.
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

  providerOptions(_model: LlmModel): SharedV2ProviderOptions {
    return {
      google: {
        toolConfig: {
          includeServerSideToolInvocations: true,
        },
      },
    }
  }
}

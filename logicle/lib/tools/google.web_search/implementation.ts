import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { GoogleWebSearchInterface } from './interface'
import { LlmModel } from '@/lib/chat/models'
import { SharedV2ProviderOptions } from '@ai-sdk/provider'

export class GoogleWebSearch extends GoogleWebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new GoogleWebSearch(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  isModelSupported(model: LlmModel): boolean {
    return (
      model.provider === 'logiclecloud' &&
      model.owned_by === 'google' &&
      model.capabilities.web_search === true
    )
  }

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    return {}
  }
  providerOptions(_model: LlmModel): SharedV2ProviderOptions {
    return {
      web_search_options: {
        search_context_size: 'medium',
      },
    }
  }
}

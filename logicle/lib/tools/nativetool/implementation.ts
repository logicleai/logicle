import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { NativeToolInterface, NativeToolParams } from './interface'
import { LlmModel } from '@/lib/chat/models'

export class NativeTool extends NativeToolInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new NativeTool(toolParams, params as unknown as NativeToolParams)
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    private params: NativeToolParams
  ) {
    super()
  }

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    let name = this.params.name
    let type = this.params.type
    if (name === 'openai.web_search_preview') {
      // Hack for legacy configuration syntax
      type = 'openai.web_search'
      name = 'web_search'
    }
    return {
      [name]: {
        type: 'provider',
        id: type as `${string}.${string}`,
        args: this.params.args || {},
      },
    }
  }
}

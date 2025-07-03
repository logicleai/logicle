import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { NativeToolInterface, NativeToolParams } from './interface'

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

  functions(): ToolFunctions {
    let name = this.params.name
    let type = this.params.type
    if (name == 'openai.web_search_preview') {
      // Hack for legacy configuration syntax
      type = 'openai.web_search_preview'
      name = 'web_search_preview'
    }
    return {
      [name]: {
        type: 'provider-defined',
        id: type as `${string}.${string}`,
        args: this.params.args || {},
      },
    }
  }
}

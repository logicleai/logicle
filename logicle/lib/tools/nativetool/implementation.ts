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
  functions: ToolFunctions = {
    WebSearch: {
      type: 'provider-defined',
      id: this.params.name as `${string}.${string}`,
      args: {},
    },
  }
}

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
    return {
      [this.params.name]: {
        type: 'provider-defined',
        id: this.params.id as `${string}.${string}`,
        args: {},
      },
    }
  }
}

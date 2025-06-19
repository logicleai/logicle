import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { ProviderOptionsToolInterface, ProviderOptionsToolParams } from './interface'
import { SharedV2ProviderOptions } from '@ai-sdk/provider'

export class ProviderOptionsTool
  extends ProviderOptionsToolInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new ProviderOptionsTool(toolParams, params as unknown as ProviderOptionsToolParams)
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    private params: ProviderOptionsToolParams
  ) {
    super()
  }

  functions(): ToolFunctions {
    return {}
  }
  providerOptions(): SharedV2ProviderOptions {
    return this.params
  }
}

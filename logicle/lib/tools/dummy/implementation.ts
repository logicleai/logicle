import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { DummyToolInterface } from './interface'

export class DummyTool extends DummyToolInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new DummyTool(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  async functions(): Promise<ToolFunctions> {
    return {}
  }
  Dummy() {}
}

import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { DummyToolInterface } from './interface'
import { LlmModel } from '@/lib/chat/models'

export class DummyTool extends DummyToolInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new DummyTool(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    return {}
  }
  Dummy() {}
}

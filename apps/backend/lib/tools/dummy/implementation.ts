import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { DummyToolInterface, DummyToolSchema } from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'

export class DummyTool extends DummyToolInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new DummyTool(toolParams, DummyToolSchema.parse(params))
  supportedMedia = []
  knowledge: dto.AssistantFile[]
  constructor(
    public toolParams: ToolParams,
    params: { files?: dto.AssistantFile[] }
  ) {
    super()
    this.knowledge = params.files ?? []
  }

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    return {}
  }
}

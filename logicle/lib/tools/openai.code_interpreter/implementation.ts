import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { OpenAiCodeInterpreterInterface } from './interface'
import { LlmModel } from '@/lib/chat/models'

export class OpenaiCodeInterpreter
  extends OpenAiCodeInterpreterInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams) => new OpenaiCodeInterpreter(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    return {
      code_interpreter: {
        type: 'provider',
        id: 'openai.code_interpreter',
        args: {
          container: {
            type: 'auto',
          },
        },
      },
      spinup_container: {
        description: 'Call this function before using python tool',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
          required: [],
        },
        invoke: async () => {
          return {
            type: 'text',
            value: 'spinup',
          }
        },
      },
    }
  }
}

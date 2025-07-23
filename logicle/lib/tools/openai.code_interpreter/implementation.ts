import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { OpenAiCodeInterpreterInterface, OpenAiCodeInterpreterParams } from './interface'

export class OpenaiCodeInterpreter
  extends OpenAiCodeInterpreterInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new OpenaiCodeInterpreter(toolParams, params as unknown as OpenAiCodeInterpreterParams)
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    private params: OpenAiCodeInterpreterParams
  ) {
    super()
  }

  functions(): ToolFunctions {
    return {
      code_interpreter: {
        type: 'provider-defined',
        id: 'openai.code_interpreter',
        args: {
          container: {
            type: 'auto',
          },
        },
      },
    }
  }
}

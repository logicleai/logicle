import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { OpenAiImageGenerationInterface } from './interface'

export class OpenaiImageGeneration
  extends OpenAiImageGenerationInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams) => new OpenaiImageGeneration(toolParams)
  supportedMedia = []
  constructor(public toolParams: ToolParams) {
    super()
  }

  async functions(): Promise<ToolFunctions> {
    return {
      image_generation: {
        type: 'provider',
        id: 'openai.image_generation',
        args: {
          //          partial_images: 3,
        },
      },
    }
  }
}

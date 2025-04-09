import { ToolImplementation, ToolFunction, ToolBuilder } from '@/lib/chat/tools'
import { AssistantKnowledgePluginInterface, AssistantKnowledgePluginParams } from './interface'
import { assistantFiles } from '@/models/assistant'

export class AssistantKnowledgePlugin
  extends AssistantKnowledgePluginInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (params: Record<string, unknown>) =>
    new AssistantKnowledgePlugin(params as AssistantKnowledgePluginParams) // TODO: need a better validation
  params: AssistantKnowledgePluginParams
  supportedMedia = []
  constructor(params: AssistantKnowledgePluginParams) {
    super()
    this.params = {
      ...params,
    }
  }

  functions: Record<string, ToolFunction> = {
    ListFiles: {
      description: 'List files available to the assistant',
      parameters: {},
      invoke: async ({ assistantId }) => {
        const files = await assistantFiles(assistantId as string)
        return JSON.stringify(files)
      },
    },
  }
}

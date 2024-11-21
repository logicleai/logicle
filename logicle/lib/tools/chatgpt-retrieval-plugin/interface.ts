import { ToolType } from '@/lib/tools/tools'

export interface ChatGptRetrievalPluginParams {
  baseUrl: string
  apiKey: string
}

export class ChatGptRetrievalPluginInterface {
  static toolName: ToolType = 'chatgpt-retrieval-plugin'
}

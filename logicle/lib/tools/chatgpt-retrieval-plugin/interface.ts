export interface ChatGptRetrievalPluginParams {
  baseUrl: string
  apiKey: string
}

export class ChatGptRetrievalPluginInterface {
  static toolName: string = 'chatgpt-retrieval-plugin'
}

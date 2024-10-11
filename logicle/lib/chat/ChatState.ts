import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import * as ai from 'ai'
import { dtoMessageToLlmMessage } from './conversion'

export class ChatState {
  llmMessages: ai.CoreMessage[]
  chatHistory: dto.Message[]
  conversationId: string
  constructor(chatHistory: dto.Message[], llmMessages: ai.CoreMessage[]) {
    this.llmMessages = llmMessages
    this.chatHistory = chatHistory
    this.conversationId = chatHistory[0].conversationId
  }

  async push(msg: dto.Message): Promise<dto.Message> {
    this.chatHistory = [...this.chatHistory, msg]
    const llmMsg = await dtoMessageToLlmMessage(msg)
    if (llmMsg) {
      this.llmMessages = [...this.llmMessages, llmMsg]
    }
    return msg
  }

  async addToolCallResultMsg(toolCall: dto.ToolCall, result: any): Promise<dto.Message> {
    const toolCallResult = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result,
    }
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool',
      content: '',
      attachments: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      toolCallResult,
    }
    await this.push(msg)
    return msg
  }

  async addToolCallAuthRequestMsg(toolCallAuthRequest: dto.ToolCall): Promise<dto.Message> {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool',
      content: '',
      attachments: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      toolCallAuthRequest,
    }
    await this.push(msg)
    return msg
  }
  createEmptyAssistantMsg(): dto.Message {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'assistant',
      content: '',
      attachments: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
    }
    return msg
  }
  createToolOutputMsg() {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool',
      content: '',
      attachments: [],
      conversationId: this.chatHistory[this.chatHistory.length - 1].conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      toolOutput: {},
    }
    return msg
  }
}

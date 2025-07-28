import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import * as ai from 'ai'
import { dtoMessageToLlmMessage } from './conversion'
import { LlmModelCapabilities } from './models'

export class ChatState {
  llmMessages: ai.CoreMessage[]
  chatHistory: dto.Message[]
  conversationId: string
  constructor(
    chatHistory: dto.Message[],
    llmMessages: ai.CoreMessage[],
    private llmModelCapabilities: LlmModelCapabilities
  ) {
    this.llmMessages = llmMessages
    this.chatHistory = chatHistory
    this.conversationId = chatHistory[0].conversationId
  }

  async push(msg: dto.Message): Promise<dto.Message> {
    this.chatHistory = [...this.chatHistory, msg]
    const llmMsg = await dtoMessageToLlmMessage(msg, this.llmModelCapabilities)
    if (llmMsg) {
      this.llmMessages = [...this.llmMessages, llmMsg]
    }
    return msg
  }

  async addToolCallResultMsg(
    toolCall: dto.ToolCall,
    result: Record<string, unknown>
  ): Promise<dto.Message> {
    const toolCallResult = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result,
    }
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool-result',
      content: '',
      attachments: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      ...toolCallResult,
    }
    await this.push(msg)
    return msg
  }

  async addToolCallAuthRequestMsg(toolCallAuthRequest: dto.ToolCall): Promise<dto.Message> {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool-auth-request',
      content: '',
      attachments: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      toolCallId: toolCallAuthRequest.toolCallId,
      toolName: toolCallAuthRequest.toolName,
      args: toolCallAuthRequest.args,
    }
    await this.push(msg)
    return msg
  }
  createEmptyAssistantMsg(): dto.AssistantMessage {
    return {
      id: nanoid(),
      role: 'assistant',
      parts: [],
      content: '',
      attachments: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
    }
  }
  createToolOutputMsg() {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool-output',
      content: '',
      attachments: [],
      conversationId: this.chatHistory[this.chatHistory.length - 1].conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
    }
    return msg
  }
  createToolDebugMsg(displayMessage: string, data: Record<string, unknown>) {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool-debug',
      content: '',
      attachments: [],
      conversationId: this.chatHistory[this.chatHistory.length - 1].conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      displayMessage: displayMessage,
      data: data,
    }
    return msg
  }

  createErrorMsg(displayMessage: string) {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'error',
      content: displayMessage,
      attachments: [],
      conversationId: this.chatHistory[this.chatHistory.length - 1].conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
    }
    return msg
  }
}

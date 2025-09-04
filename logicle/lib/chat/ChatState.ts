import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import * as ai from 'ai'
import { dtoMessageToLlmMessage } from './conversion'
import { LlmModelCapabilities } from './models'

export class ChatState {
  chatHistory: dto.Message[]
  conversationId: string
  constructor(chatHistory: dto.Message[]) {
    this.chatHistory = chatHistory
    this.conversationId = chatHistory[0].conversationId
  }

  async push(msg: dto.Message): Promise<dto.Message> {
    this.chatHistory = [...this.chatHistory, msg]
    return msg
  }

  createToolMsg(): dto.ToolMessage {
    return {
      id: nanoid(),
      role: 'tool',
      attachments: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      parts: [],
    }
  }

  async addToolCallAuthRequestMsg(toolCallAuthRequest: dto.ToolCall): Promise<dto.Message> {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool-auth-request',
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
      attachments: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
    }
  }
}

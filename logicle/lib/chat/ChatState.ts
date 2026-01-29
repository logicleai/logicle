import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { applyStreamPartToMessages } from './streamApply'

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
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      parts: [],
    }
  }

  createToolCallAuthRequestMsg(toolCallAuthRequest: dto.ToolCall): dto.Message {
    const msg: dto.Message = {
      id: nanoid(),
      role: 'tool-auth-request',
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      toolCallId: toolCallAuthRequest.toolCallId,
      toolName: toolCallAuthRequest.toolName,
      args: toolCallAuthRequest.args,
    }
    return msg
  }

  createEmptyAssistantMsg(): dto.AssistantMessage {
    return {
      id: nanoid(),
      role: 'assistant',
      parts: [],
      conversationId: this.conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
    }
  }

  applyStreamPart(streamPart: dto.TextStreamPart) {
    if (streamPart.type === 'message') {
      this.chatHistory = [...this.chatHistory, streamPart.msg]
      return
    }
    if (streamPart.type === 'summary') {
      return
    }
    this.chatHistory = applyStreamPartToMessages(this.chatHistory, streamPart)
  }

  appendMessage<T extends dto.Message>(message: T): T {
    this.applyStreamPart({ type: 'message', msg: message })
    return this.getLastMessage() as T
  }

  getLastMessage(): dto.Message | undefined {
    return this.chatHistory[this.chatHistory.length - 1]
  }

  getLastMessageAssert<T extends dto.Message>(role: T['role']): T {
    const lastMessage = this.getLastMessage()
    if (!lastMessage) {
      throw new Error('No message available for stream update')
    }
    if (lastMessage.role !== role) {
      throw new Error(`Last message role mismatch: expected ${role}, got ${lastMessage.role}`)
    }
    return lastMessage as T
  }
}

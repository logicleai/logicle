import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { applyStreamPartToMessage } from './streamApply'

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
    const lastIndex = this.chatHistory.length - 1
    const lastMessage = this.chatHistory[lastIndex]
    if (!lastMessage) {
      throw new Error('No message available for stream update')
    }
    if (streamPart.type === 'text' || streamPart.type === 'reasoning') {
      if (lastMessage.role !== 'assistant') {
        throw new Error(`Invalid stream part for role ${lastMessage.role}: ${streamPart.type}`)
      }
    }
    if (streamPart.type === 'citations') {
      if (lastMessage.role !== 'assistant' && lastMessage.role !== 'tool') {
        throw new Error(`Invalid stream part for role ${lastMessage.role}: ${streamPart.type}`)
      }
    }
    if (streamPart.type === 'attachment' && lastMessage.role !== 'user') {
      throw new Error(`Invalid attachment stream part for role ${lastMessage.role}`)
    }
    if (streamPart.type === 'part' && lastMessage.role === 'user') {
      throw new Error('Invalid part stream update for user message')
    }
    const nextMessage = applyStreamPartToMessage(lastMessage, streamPart)
    this.chatHistory = [...this.chatHistory.slice(0, lastIndex), nextMessage]
  }

  appendMessage<T extends dto.Message>(message: T): T {
    this.applyStreamPart({ type: 'message', msg: message })
    const lastMessage = this.getLastMessage()
    if (!lastMessage) {
      throw new Error('Message append failed: no last message')
    }
    if (lastMessage.id !== message.id || lastMessage.role !== message.role) {
      throw new Error(
        `Message append failed: expected ${message.role}:${message.id}, got ${lastMessage.role}:${lastMessage.id}`
      )
    }
    return lastMessage as T
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

type AssistantMessagePartType = dto.AssistantMessagePart['type']

function isAssistantMessagePart(part: dto.MessagePart): part is dto.AssistantMessagePart {
  const validTypes: AssistantMessagePartType[] = [
    'text',
    'reasoning',
    'tool-call',
    'builtin-tool-call',
    'builtin-tool-result',
    'error',
    'debug',
  ]
  return validTypes.includes(part.type as AssistantMessagePartType)
}

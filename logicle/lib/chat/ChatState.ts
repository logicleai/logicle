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
    const nextMessage = applyStreamPartToMessage(lastMessage, streamPart)
    this.chatHistory = [...this.chatHistory.slice(0, lastIndex), nextMessage]
  }

  getLastMessage(): dto.Message | undefined {
    return this.chatHistory[this.chatHistory.length - 1]
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

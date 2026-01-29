import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'

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

  applyStreamPartToMessage(message: dto.Message, streamPart: dto.TextStreamPart) {
    if (streamPart.type === 'part') {
      if (message.role === 'assistant') {
        if (!isAssistantMessagePart(streamPart.part)) {
          throw new Error(`Invalid assistant part type: ${streamPart.part.type}`)
        }
        message.parts.push(streamPart.part)
        return
      }
      if (message.role === 'tool') {
        if (streamPart.part.type !== 'tool-result' && streamPart.part.type !== 'debug') {
          throw new Error(`Invalid tool part type: ${streamPart.part.type}`)
        }
        message.parts.push(streamPart.part)
        return
      }
      throw new Error(`Cannot append parts to message role ${message.role}`)
    }

    if (streamPart.type === 'text') {
      if (message.role !== 'assistant') {
        throw new Error('Received text delta for non-assistant message')
      }
      const lastPart = message.parts[message.parts.length - 1]
      if (!lastPart || lastPart.type !== 'text') {
        throw new Error('Received text delta but last part is not text')
      }
      lastPart.text = lastPart.text + streamPart.text
      return
    }

    if (streamPart.type === 'reasoning') {
      if (message.role !== 'assistant') {
        throw new Error('Received reasoning delta for non-assistant message')
      }
      const lastPart = message.parts[message.parts.length - 1]
      if (!lastPart || lastPart.type !== 'reasoning') {
        throw new Error('Received reasoning delta but last part is not reasoning')
      }
      lastPart.reasoning = lastPart.reasoning + streamPart.reasoning
      return
    }

    if (streamPart.type === 'citations') {
      message.citations = [...(message.citations ?? []), ...streamPart.citations]
      return
    }

    if (streamPart.type === 'attachment') {
      if (message.role !== 'user') {
        throw new Error('Received attachment for non-user message')
      }
      message.attachments = [...message.attachments, streamPart.attachment]
      return
    }

    if (streamPart.type === 'summary' || streamPart.type === 'message') {
      return
    }

    throw new Error(`Unsupported stream part type: ${streamPart.type}`)
  }

  applyStreamPart(streamPart: dto.TextStreamPart) {
    if (streamPart.type === 'message') {
      this.chatHistory = [...this.chatHistory, streamPart.msg]
      return
    }
    if (streamPart.type === 'summary') {
      return
    }
    const lastMessage = this.chatHistory[this.chatHistory.length - 1]
    if (!lastMessage) {
      throw new Error('No message available for stream update')
    }
    this.applyStreamPartToMessage(lastMessage, streamPart)
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

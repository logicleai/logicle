import * as dto from '@/types/dto'

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

export function applyStreamPartToMessage(
  message: dto.Message,
  streamPart: dto.TextStreamPart
): dto.Message {
  if (streamPart.type === 'part') {
    if (message.role === 'assistant') {
      if (!isAssistantMessagePart(streamPart.part)) {
        throw new Error(`Invalid assistant part type: ${streamPart.part.type}`)
      }
      return {
        ...message,
        parts: [...message.parts, streamPart.part],
      }
    }
    if (message.role === 'tool') {
      if (streamPart.part.type !== 'tool-result' && streamPart.part.type !== 'debug') {
        throw new Error(`Invalid tool part type: ${streamPart.part.type}`)
      }
      return {
        ...message,
        parts: [...message.parts, streamPart.part],
      }
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
    return {
      ...message,
      parts: [
        ...message.parts.slice(0, -1),
        { ...lastPart, text: lastPart.text + streamPart.text },
      ],
    }
  }

  if (streamPart.type === 'reasoning') {
    if (message.role !== 'assistant') {
      throw new Error('Received reasoning delta for non-assistant message')
    }
    const lastPart = message.parts[message.parts.length - 1]
    if (!lastPart || lastPart.type !== 'reasoning') {
      throw new Error('Received reasoning delta but last part is not reasoning')
    }
    return {
      ...message,
      parts: [
        ...message.parts.slice(0, -1),
        { ...lastPart, reasoning: lastPart.reasoning + streamPart.reasoning },
      ],
    }
  }

  if (streamPart.type === 'citations') {
    return {
      ...message,
      citations: [...(message.citations ?? []), ...streamPart.citations],
    }
  }

  if (streamPart.type === 'attachment') {
    if (message.role !== 'user') {
      throw new Error('Received attachment for non-user message')
    }
    return {
      ...message,
      attachments: [...message.attachments, streamPart.attachment],
    }
  }

  throw new Error(`Unsupported stream part type: ${streamPart.type}`)
}

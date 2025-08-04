import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export type ToolCallMessageV1 = dto.BaseMessage &
  dto.ToolCall & {
    role: 'tool-call'
    reasoning?: string
    reasoning_signature?: string
  }

export type AssistantMessageV1 = dto.BaseMessage & {
  role: 'assistant'
  reasoning?: string
  reasoning_signature?: string
}

export type ToolResultMessageV1 = dto.BaseMessage &
  dto.ToolCallResult & {
    role: 'tool-result'
  }

export type ToolOutputMessageV1 = dto.BaseMessage & {
  role: 'tool-output'
}

export type ErrorMessageV1 = dto.BaseMessage & {
  role: 'error'
}

export type DebugMessageV1 = dto.BaseMessage & {
  role: 'tool-debug'
  displayMessage: string
  data: Record<string, unknown>
}

type MessageV1 =
  | dto.UserMessage
  | AssistantMessageV1
  | ToolCallMessageV1
  | ToolOutputMessageV1
  | ToolResultMessageV1
  | ErrorMessageV1
  | DebugMessageV1
  | dto.ToolCallAuthRequestMessage
  | dto.ToolCallAuthResponseMessage

export const parseV1 = (m: schema.Message) => {
  const content = m.content
  if (content.startsWith('{')) {
    let parsed = JSON.parse(content) as {
      content: string
      attachments: dto.Attachment[]
      toolCallAuthRequest?: any
      toolCallAuthResponse?: any
      toolCall?: any
      toolCallResult?: any
      toolOutput?: any
    }

    let role:
      | dto.Message['role']
      | 'tool-call'
      | 'tool-result'
      | 'tool-output'
      | 'tool-debug'
      | 'error' = m.role
    if (parsed.toolCallAuthRequest) {
      role = 'tool-auth-request'
      parsed = { ...parsed, ...parsed.toolCallAuthRequest }
      parsed.toolCallAuthRequest = undefined
    } else if (parsed.toolCallAuthResponse) {
      role = 'tool-auth-response'
      parsed = { ...parsed, ...parsed.toolCallAuthResponse }
      parsed.toolCallAuthResponse = undefined
    } else if (parsed.toolOutput) {
      role = 'tool-output'
      parsed = { ...parsed, ...parsed.toolOutput }
      parsed.toolOutput = undefined
    } else if (parsed.toolCall) {
      role = 'tool-call'
      parsed = { ...parsed, ...parsed.toolCall }
      parsed.toolCall = undefined
    } else if (parsed.toolCallResult) {
      role = 'tool-result'
      parsed = { ...parsed, ...parsed.toolCallResult }
      parsed.toolCallResult = undefined
    }
    return {
      ...m,
      ...parsed,
      role,
    } as MessageV1 | dto.Message
  } else {
    // Support older format, when content was simply a string
    return {
      ...m,
      attachments: [],
    } as MessageV1 | dto.Message
  }
}

export const convertV2 = (msg: MessageV1 | dto.Message): dto.Message => {
  const makeReasoningPart = (reasoning?: string, reasoning_signature?: string) => {
    if (!reasoning) return []
    return [
      {
        type: 'reasoning',
        reasoning,
        reasoning_signature,
      } satisfies dto.AssistantMessagePart,
    ]
  }
  const makeTextPart = (text: string) => {
    if (!text.length) return []
    return [
      {
        type: 'text',
        text: text,
      } satisfies dto.TextPart,
    ]
  }
  if (msg.role == 'assistant') {
    if (!(msg as dto.AssistantMessage).parts) {
      const { content, reasoning, reasoning_signature, ...rest } = msg as AssistantMessageV1
      return {
        ...rest,
        content: '',
        parts: [...makeReasoningPart(reasoning, reasoning_signature), ...makeTextPart(content)],
        role: 'assistant',
      }
    } else {
      return msg as dto.AssistantMessage
    }
  } else if (msg.role == 'tool-result') {
    return {
      role: 'tool',
      id: msg.id,
      content: '',
      conversationId: msg.conversationId,
      parent: msg.parent,
      sentAt: msg.sentAt,
      attachments: msg.attachments,
      parts: [
        {
          type: 'tool-result',
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          result: msg.result,
        },
      ],
    } satisfies dto.ToolMessage
  } else if (msg.role == 'tool-debug') {
    return {
      role: 'tool',
      id: msg.id,
      content: '',
      conversationId: msg.conversationId,
      parent: msg.parent,
      sentAt: msg.sentAt,
      attachments: msg.attachments,
      parts: [{ type: 'debug', displayMessage: msg.displayMessage, data: msg.data }],
    } satisfies dto.ToolMessage
  } else if (msg.role == 'tool-output') {
    return {
      role: 'tool',
      id: msg.id,
      content: '',
      conversationId: msg.conversationId,
      parent: msg.parent,
      sentAt: msg.sentAt,
      attachments: msg.attachments,
      parts: [],
    } satisfies dto.ToolMessage
  } else if (msg.role == 'tool-call') {
    const { reasoning, reasoning_signature, toolCallId, toolName, args, ...rest } = msg
    return {
      ...rest,
      role: 'assistant',
      parts: [
        ...makeReasoningPart(reasoning, reasoning_signature),
        {
          type: 'tool-call',
          toolCallId,
          toolName,
          args,
        },
      ],
    }
  } else if (msg.role == 'error') {
    return {
      ...msg,
      role: 'assistant',
      parts: [],
    } satisfies dto.AssistantMessage
  } else {
    return msg
  }
}

export const dtoMessageFromDbMessage = (m: schema.Message): dto.Message => {
  const msgV1 = parseV1(m)
  return convertV2(msgV1)
}

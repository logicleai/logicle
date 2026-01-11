import * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { AssistantMessageV1, MessageV1 } from '@/types/legacy/messages-v1'
import {
  AssistantMessagePartV2,
  AssistantMessageV2,
  MessageV2,
  TextPartV2,
  ToolMessageV2,
} from '@/types/legacy/messages-v2'

export const parseV1 = (m: schema.Message) => {
  const content = m.content
  if (content.startsWith('{')) {
    let parsed = JSON.parse(content) as {
      content?: string
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
    const { content: _content, ...mnocontent } = m
    return {
      ...mnocontent,
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

export const convertV2 = (msg: MessageV1 | dto.Message): MessageV2 => {
  const makeReasoningPart = (reasoning?: string, reasoning_signature?: string) => {
    if (!reasoning) return []
    return [
      {
        type: 'reasoning',
        reasoning,
        reasoning_signature,
      } satisfies AssistantMessagePartV2,
    ]
  }
  const makeTextPart = (text: string): TextPartV2[] => {
    if (!text.length) return []
    return [
      {
        type: 'text',
        text: text,
      } satisfies TextPartV2,
    ]
  }
  if (msg.role === 'assistant') {
    if (!(msg as dto.AssistantMessage).parts) {
      const { content, reasoning, reasoning_signature, ...rest } = msg as AssistantMessageV1
      return {
        ...rest,
        parts: [...makeReasoningPart(reasoning, reasoning_signature), ...makeTextPart(content)],
        role: 'assistant',
      }
    } else {
      return msg as AssistantMessageV2
    }
  } else if (msg.role === 'tool-result') {
    return {
      role: 'tool',
      id: msg.id,
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
    } satisfies ToolMessageV2
  } else if (msg.role === 'tool-debug') {
    return {
      role: 'tool',
      id: msg.id,
      conversationId: msg.conversationId,
      parent: msg.parent,
      sentAt: msg.sentAt,
      attachments: msg.attachments,
      parts: [{ type: 'debug', displayMessage: msg.displayMessage, data: msg.data }],
    } satisfies ToolMessageV2
  } else if (msg.role === 'tool-output') {
    return {
      role: 'tool',
      id: msg.id,
      conversationId: msg.conversationId,
      parent: msg.parent,
      sentAt: msg.sentAt,
      attachments: msg.attachments,
      parts: [],
    } satisfies ToolMessageV2
  } else if (msg.role === 'tool-call') {
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
  } else if (msg.role === 'error') {
    return {
      ...msg,
      role: 'assistant',
      parts: [],
    } satisfies AssistantMessageV2
  } else {
    return msg as MessageV2
  }
}

export const dtoMessageFromDbMessage = (m: schema.Message): dto.Message => {
  const msgV1 = parseV1(m)
  return convertV2(msgV1)
}

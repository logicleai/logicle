import * as schema from '@/db/schema'
import { AssistantMessageV1, AttachmentV1, MessageV1 } from '@/types/legacy/messages-v1'
import {
  AssistantMessagePartV2,
  AssistantMessageV2,
  MessageV2,
  TextPartV2,
  ToolMessageV2,
} from '@/types/legacy/messages-v2'
import * as dto from '@/types/dto'
import { LanguageModelV2ToolResultOutput, LanguageModelV3ToolResultOutput } from '@ai-sdk/provider'
import * as ai from 'ai'

export const parseV1OrV2 = (m: schema.Message): MessageV1 | MessageV2 => {
  const content = m.content
  if (content.startsWith('{')) {
    let parsed = JSON.parse(content) as {
      content?: string
      attachments: AttachmentV1[]
      toolCallAuthRequest?: any
      toolCallAuthResponse?: any
      toolCall?: any
      toolCallResult?: any
      toolOutput?: any
    }

    let role: schema.Message['role'] = m.role
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
    const { content: _content, version: _version, ...mnocontent } = m
    return {
      ...mnocontent,
      ...parsed,
      role,
    } as MessageV1 | MessageV2
  } else {
    // Support older format, when content was simply a string
    const { version: _version, ...mnocontent } = m
    return { ...mnocontent, attachments: [] } as MessageV1 | MessageV2
  }
}

export const convertToV2 = (msg: MessageV1 | MessageV2): MessageV2 => {
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
    if (!('parts' in msg)) {
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

const convertToolResultOutputV2ToV3 = (
  output: LanguageModelV2ToolResultOutput | unknown
): LanguageModelV3ToolResultOutput => {
  if (output && typeof output === 'object' && 'type' in output) {
    const casted = output as LanguageModelV2ToolResultOutput
    if (casted.type === 'content') {
      return {
        type: 'content',
        value: casted.value.map((m) => {
          if (m.type === 'media') {
            return {
              ...m,
              type: 'file-data',
            }
          }
          return m
        }),
      }
    }
  } else if (typeof output === 'string') {
    return {
      type: 'text',
      value: output as string,
    }
  }
  return {
    type: 'json',
    value: output as ai.JSONValue,
  }
}

const convertAssistantPartV2toV3 = (part: AssistantMessagePartV2): dto.AssistantMessagePart => {
  if (part.type === 'builtin-tool-result') {
    return { ...part, result: convertToolResultOutputV2ToV3(part.result) }
  }
  return part
}

const convertToolPartV2toV3 = (
  part: ToolMessageV2['parts'][number]
): dto.ToolMessage['parts'][number] => {
  if (part.type === 'tool-result') {
    return { ...part, result: convertToolResultOutputV2ToV3(part.result) }
  }
  return part
}

const convertV2ToV3 = (msg: MessageV2): dto.Message => {
  if (msg.role === 'assistant') {
    return {
      ...msg,
      parts: msg.parts.map(convertAssistantPartV2toV3),
    }
  }
  if (msg.role === 'tool') {
    return {
      ...msg,
      parts: msg.parts.map(convertToolPartV2toV3),
    }
  }
  return msg
}

export const dtoMessageFromDbMessage = (m: schema.Message): dto.Message => {
  if (m.version === 3) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      parent: m.parent,
      role: m.role,
      sentAt: m.sentAt,
      ...JSON.parse(m.content),
    }
  } else {
    const msgV1 = parseV1OrV2(m)
    const msgV2 = convertToV2(msgV1)
    return convertV2ToV3(msgV2)
  }
}

import * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { RetryAgent } from 'undici'

export type ToolCallMessage = dto.BaseMessage &
  dto.ToolCall & {
    role: 'tool-call'
  }

type MessageV1 = dto.Message | ToolCallMessage

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

    let role: dto.Message['role'] | 'tool-call' = m.role
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
    } as MessageV1
  } else {
    // Support older format, when content was simply a string
    return {
      ...m,
      attachments: [],
    } as MessageV1
  }
}

export const convertV2 = (msgV1: MessageV1): dto.Message => {
  if (msgV1.role == 'tool-call') {
    const { toolCallId, toolName, args, ...rest } = msgV1
    return {
      ...rest,
      role: 'assistant',
      toolCalls: [
        {
          toolCallId,
          toolName,
          args,
        },
      ],
    }
  } else {
    return msgV1
  }
}

export const dtoMessageFromDbMessage = (m: schema.Message): dto.Message => {
  const msgV1 = parseV1(m)
  return convertV2(msgV1)
}

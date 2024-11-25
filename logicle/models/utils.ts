import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const dtoMessageFromDbMessage = (m: schema.Message): dto.Message => {
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
    let role: dto.Message['role'] = m.role
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
    }
    return {
      ...m,
      ...parsed,
    } as dto.Message
  } else {
    // Support older format, when content was simply a string
    return {
      ...m,
      attachments: [],
    } as dto.Message
  }
}

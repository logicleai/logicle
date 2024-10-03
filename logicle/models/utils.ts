import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const dtoMessageFromDbMessage = (m: schema.Message): dto.Message => {
  const content = m.content
  if (content.startsWith('{')) {
    const parsed = JSON.parse(content) as {
      content: string
      attachments: dto.Attachment[]
      toolCallAuthRequest?: any
      toolCallAuthResponse?: any
      toolCall?: any
      toolCallResult?: any
    }
    return {
      ...m,
      content: parsed.content,
      attachments: parsed.attachments,
      toolCallAuthRequest: parsed.toolCallAuthRequest,
      toolCallAuthResponse: parsed.toolCallAuthResponse,
      toolCall: parsed.toolCall,
      toolCallResult: parsed.toolCallResult,
    } as dto.Message
  } else {
    // Support older format, when content was simply a string
    return {
      ...m,
      attachments: [],
    } as dto.Message
  }
}

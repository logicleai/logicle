import * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { parse } from 'path'

export const MessageFromMessage = (m: schema.Message): dto.Message => {
  const content = m.content
  if (content.startsWith('{')) {
    const parsed = JSON.parse(content) as {
      content: string
      attachments: dto.Attachment[]
      metadata?: any[]
    }
    return {
      ...m,
      content: parsed.content,
      attachments: parsed.attachments,
      metadata: parsed.metadata,
    } as dto.Message
  } else {
    // Support older format, when content was simply a string
    return {
      ...m,
      attachments: [],
    } as dto.Message
  }
}

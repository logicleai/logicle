import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const MessageFromMessage = (m: schema.Message): dto.Message => {
  const content = m.content
  if (content.startsWith('{')) {
    const parsed = JSON.parse(content) as { content: string; attachments: dto.Attachment[] }
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

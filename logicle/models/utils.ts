import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const messageDtoFromMessage = (m: schema.Message): dto.MessageDTO => {
  const content = m.content
  if (content.startsWith('{')) {
    const parsed = JSON.parse(content) as { content: string; attachments: dto.Attachment[] }
    return {
      ...m,
      ...parsed,
    } as dto.MessageDTO
  } else {
    // Support older format, when content was simply a string
    return {
      ...m,
      attachments: [],
    } as dto.MessageDTO
  }
}

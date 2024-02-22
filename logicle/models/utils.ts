import { Message } from '@/db/types'
import { Attachment, MessageDTO } from '@/types/chat'

export const messageDtoFromMessage = (m: Message): MessageDTO => {
  const content = m.content
  if (content.startsWith('{')) {
    const parsed = JSON.parse(content) as { content: string; attachments: Attachment[] }
    return {
      ...m,
      ...parsed,
    } as MessageDTO
  } else {
    // Support older format, when content was simply a string
    return {
      ...m,
      attachments: [],
    } as MessageDTO
  }
}

import { ConversationWithMessages } from '@/lib/chat/types'
import { applyStreamPartToMessages } from '@/lib/chat/streamApply'
import * as dto from '@/types/dto'

export const applyChatRunEventToConversation = (
  conversation: ConversationWithMessages,
  event: dto.TextStreamPart
): ConversationWithMessages => {
  if (event.type === 'summary') {
    return {
      ...conversation,
      name: event.summary,
    }
  }

  return {
    ...conversation,
    messages: applyStreamPartToMessages(conversation.messages, event),
  }
}

export const applyChatRunFailureToConversation = ({
  conversation,
  error,
}: {
  conversation: ConversationWithMessages
  error: string
}): ConversationWithMessages => {
  if (conversation.messages.length === 0) {
    return conversation
  }

  const lastIndex = conversation.messages.length - 1
  return {
    ...conversation,
    messages: [
      ...conversation.messages.slice(0, lastIndex),
      {
        ...conversation.messages[lastIndex],
        error,
      },
    ],
  }
}

import { ConversationWithMessages } from '@/lib/chat/types'
import { applyStreamPartToMessages } from '@/lib/chat/streamApply'
import * as dto from '@/types/dto'

export const THINKING_PLACEHOLDER_ID = '__thinking_placeholder__'

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

  if (event.type === 'message') {
    const messages = conversation.messages
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.id === THINKING_PLACEHOLDER_ID) {
      // Keep an empty text part so the streaming cursor (▍) stays visible until
      // the first real content part arrives and replaces it.
      const assistantMsg = event.msg as dto.AssistantMessage
      const msg: dto.AssistantMessage =
        assistantMsg.parts.length === 0
          ? { ...assistantMsg, parts: [{ type: 'text', text: '' }] }
          : assistantMsg
      return {
        ...conversation,
        messages: [...messages.slice(0, -1), msg],
      }
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

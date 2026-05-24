import { ConversationWithMessages } from '@/lib/chat/types'
import { applyStreamPartToMessages } from '@/lib/chat/streamApply'
import * as dto from '@/types/dto'

export const THINKING_PLACEHOLDER_ID = '__thinking_placeholder__'

/**
 * Returns a new conversation with the thinking placeholder removed if it is the last
 * message. If the placeholder is not present, returns the conversation unchanged.
 */
export const removePlaceholderIfPresent = (
  conversation: ConversationWithMessages
): ConversationWithMessages => {
  const messages = conversation.messages
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.id !== THINKING_PLACEHOLDER_ID) {
    return conversation
  }
  return {
    ...conversation,
    messages: messages.slice(0, -1),
  }
}

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
      return {
        ...conversation,
        messages: [...messages.slice(0, -1), event.msg],
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
  const withoutPlaceholder = removePlaceholderIfPresent(conversation)
  if (withoutPlaceholder.messages.length === 0) {
    return withoutPlaceholder
  }

  const lastIndex = withoutPlaceholder.messages.length - 1
  return {
    ...withoutPlaceholder,
    messages: [
      ...withoutPlaceholder.messages.slice(0, lastIndex),
      {
        ...withoutPlaceholder.messages[lastIndex],
        error,
      },
    ],
  }
}

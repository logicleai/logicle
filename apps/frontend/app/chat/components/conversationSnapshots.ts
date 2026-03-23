import { ConversationWithMessages } from '@/lib/chat/types'

const canReuseCachedMessages = (
  cachedConversation: ConversationWithMessages,
  nextConversation: ConversationWithMessages
) => {
  const serverMessages = nextConversation.messages
  const cachedMessages = cachedConversation.messages

  return (
    cachedMessages.length >= serverMessages.length &&
    serverMessages.every((message, index) => cachedMessages[index]?.id === message.id)
  )
}

export const mergeConversationSnapshot = ({
  cachedConversation,
  nextConversation,
  preserveLocalMessages,
}: {
  cachedConversation?: ConversationWithMessages
  nextConversation: ConversationWithMessages
  preserveLocalMessages?: boolean
}): ConversationWithMessages => {
  if (!cachedConversation) {
    return nextConversation
  }

  return {
    ...nextConversation,
    messages:
      preserveLocalMessages && canReuseCachedMessages(cachedConversation, nextConversation)
        ? cachedConversation.messages
        : nextConversation.messages,
    targetLeaf: cachedConversation.targetLeaf,
  }
}

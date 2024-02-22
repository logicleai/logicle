import { ConversationWithMessages, MessageDTO } from '@/types/chat'

export const flatten = (chat: ConversationWithMessages) => {
  const messages = chat.messages
  if (messages.length == 0) {
    return chat
  }
  const nonLeaves = new Set<string>()
  const leaves = new Array<MessageDTO>()
  messages.forEach((msg) => {
    if (msg.parent) {
      nonLeaves.add(msg.parent)
    }
  })
  messages.forEach((msg) => {
    if (!nonLeaves.has(msg.id)) {
      leaves.push(msg)
    }
  })
  const oldestLeaf = leaves.reduce((a, b) => (a.sentAt > b.sentAt ? a : b))

  const flattened: MessageDTO[] = []
  const messagesById = new Map(messages.map((obj) => [obj.id, obj]))
  let msg: MessageDTO | null | undefined = oldestLeaf
  flattened.push(oldestLeaf)
  while (msg.parent && (msg = messagesById.get(msg.parent))) {
    flattened.push(msg)
  }
  flattened.reverse()
  return {
    ...chat,
    messages: flattened,
  }
}

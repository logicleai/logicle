import * as dto from '@/types/dto'

export interface MessageGroup {
  actor: 'user' | 'assistant'
  messages: dto.Message[]
}

// Extract from a message tree, the thread, i.e. a linear sequence of messages,
// ending with the most recent message
export const flatten = (messages: dto.Message[]) => {
  if (messages.length == 0) {
    return []
  }
  const nonLeaves = new Set<string>()
  const leaves = new Array<dto.Message>()
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

  const flattened: dto.Message[] = []
  const messagesById = new Map(messages.map((obj) => [obj.id, obj]))
  let msg: dto.Message | null | undefined = oldestLeaf
  flattened.push(oldestLeaf)
  while (msg.parent && (msg = messagesById.get(msg.parent))) {
    flattened.push(msg)
  }
  flattened.reverse()
  return flattened
}

// convert a thread to a UI friendly sequence of interleaved user / assistant groups,
// where:
// * user group is a message sent by a user
// * assistant group is all the other messages between a user group:
//   * toolCall
//   * toolCallResult
//   * confirmRequest
//   * confirmResponse
//   * assistantResponse
export const groupMessages = (messages: dto.Message[]) => {
  const result: MessageGroup[] = []
  let currentGroup: MessageGroup | undefined
  for (const message of messages) {
    const isUser = message.role == 'user'
    if (!currentGroup || (currentGroup.actor == 'user') != isUser) {
      currentGroup = {
        actor: isUser ? 'user' : 'assistant',
        messages: [],
      }
      result.push(currentGroup)
    }
    currentGroup.messages.push(message)
  }
  return result
}

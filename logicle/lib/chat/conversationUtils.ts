import { MessageGroup, MessageWithError, MessageWithErrorExt, ToolCallMessageEx } from './types'
import * as dto from '@/types/dto'

export function extractLinearConversation(
  messages: dto.Message[],
  from: dto.Message
): dto.Message[] {
  const msgMap = new Map<string, dto.Message>()
  messages.forEach((msg) => {
    msgMap[msg.id] = msg
  })

  const list: dto.Message[] = []
  do {
    list.push(from)
    from = msgMap[from.parent ?? 'none']
  } while (from)
  return list.slice().reverse()
}

// Extract from a message tree, the thread, i.e. a linear sequence of messages,
// ending with the most recent message
export const flatten = (messages: MessageWithError[]) => {
  if (messages.length == 0) {
    return []
  }
  const nonLeaves = new Set<string>()
  const leaves = new Array<MessageWithError>()
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

  const flattened: MessageWithError[] = []
  const messagesById = new Map(messages.map((obj) => [obj.id, obj]))
  let msg: MessageWithError | null | undefined = oldestLeaf
  flattened.push(oldestLeaf)
  while (msg.parent && (msg = messagesById.get(msg.parent))) {
    flattened.push(msg)
  }
  flattened.reverse()
  return flattened
}

export const makeGroup = (
  actor: 'user' | 'assistant',
  messages: MessageWithError[]
): MessageGroup => {
  const MessageWithErrorExts: MessageWithErrorExt[] = []
  const pendingToolCalls = new Map<string, ToolCallMessageEx>()
  const pendingAuthorizationReq = new Map<string, string>()
  for (const msg of messages) {
    let msgExt: MessageWithErrorExt
    if (msg.role == 'tool-call') {
      msgExt = {
        ...msg,
        status: 'running',
      }
      pendingToolCalls.set(msg.toolCallId, msgExt)
    } else {
      msgExt = msg
      if (msg.role == 'tool-result') {
        const related = pendingToolCalls.get(msg.toolCallId)
        if (related) {
          related.status = 'completed'
        }
      }
      if (msg.role == 'tool-auth-request') {
        const related = pendingToolCalls.get(msg.toolCallId)
        if (related) {
          related.status = 'need-auth'
          pendingAuthorizationReq.set(msg.id, msg.toolCallId)
        }
      }
      if (msg.role == 'tool-auth-response') {
        const toolCallId = pendingAuthorizationReq.get(msg.parent ?? '')
        if (toolCallId) {
          const related = pendingToolCalls.get(toolCallId)
          if (related) {
            related.status = 'running'
          }
        }
      }
    }
    MessageWithErrorExts.push(msgExt)
  }
  return {
    actor,
    messages: MessageWithErrorExts,
  }
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
export const groupMessages = (messages: MessageWithError[]) => {
  const result: MessageGroup[] = []
  let currentGroupActor: 'user' | 'assistant' | undefined
  let currentGroupMessages: MessageWithError[] = []
  for (const message of messages) {
    const isUser = message.role == 'user'
    if (!currentGroupActor || (currentGroupActor == 'user') != isUser) {
      if (currentGroupActor) {
        result.push(makeGroup(currentGroupActor, currentGroupMessages))
      }
      currentGroupActor = isUser ? 'user' : 'assistant'
      currentGroupMessages = []
    }
    currentGroupMessages.push(message)
  }
  if (currentGroupActor) {
    result.push(makeGroup(currentGroupActor, currentGroupMessages))
  }
  return result
}

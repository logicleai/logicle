import {
  IMessageGroup,
  IUserMessageGroup,
  MessageWithError,
  MessageWithErrorExt,
  ToolCallMessageEx,
} from './types'
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
export const flatten = (messages: MessageWithError[], leafMessage?: string) => {
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
  const targetLeaf =
    messages.find((m) => m.id == leafMessage) ??
    leaves.reduce((a, b) => (a.sentAt > b.sentAt ? a : b))

  const flattened: MessageWithError[] = []
  const messagesById = new Map(messages.map((obj) => [obj.id, obj]))
  let msg: MessageWithError | null | undefined = targetLeaf
  flattened.push(targetLeaf)
  while (msg.parent && (msg = messagesById.get(msg.parent))) {
    flattened.push(msg)
  }
  flattened.reverse()
  return flattened
}

const findChildren = (allMessages: MessageWithError[], msgId: string | null) => {
  const siblings = allMessages.filter((m) => m.parent == msgId)
  siblings.sort((a, b) => a.sentAt.localeCompare(b.sentAt))
  return siblings.map((s) => s.id)
}

const makeUserGroup = (
  message: dto.UserMessage,
  allMessages: MessageWithError[]
): IUserMessageGroup => {
  return {
    actor: 'user',
    message: message,
    siblings: findChildren(allMessages, message.parent),
  }
}

const makeAssistantGroup = (
  messages: MessageWithError[],
  allMessages: MessageWithError[]
): IMessageGroup => {
  const messageWithErrorExts: MessageWithErrorExt[] = []
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
      msgExt = {
        ...msg,
      }
      if (msg.role == 'tool-result') {
        const related = pendingToolCalls.get(msg.toolCallId)
        if (related) {
          related.status = 'completed'
          related.result = msg
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
    messageWithErrorExts.push(msgExt)
  }
  return {
    actor: 'assistant',
    messages: messageWithErrorExts,
    siblings: findChildren(allMessages, messageWithErrorExts[0].parent),
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
export const groupMessages = (
  messages_: MessageWithError[],
  targetLeaf?: string
): IMessageGroup[] => {
  const flattened = flatten(messages_, targetLeaf)
  const groups: IMessageGroup[] = []
  let currentAssistantMessages: MessageWithError[] | undefined
  for (const message of flattened) {
    if (message.role == 'user') {
      if (currentAssistantMessages) {
        groups.push(makeAssistantGroup(currentAssistantMessages, messages_))
      }
      currentAssistantMessages = undefined
      groups.push(makeUserGroup(message, messages_))
    } else {
      currentAssistantMessages = currentAssistantMessages ?? []
      currentAssistantMessages.push(message)
    }
  }
  if (currentAssistantMessages) {
    groups.push(makeAssistantGroup(currentAssistantMessages, messages_))
  }
  return groups
}

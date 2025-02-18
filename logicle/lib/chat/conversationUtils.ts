import * as dto from '@/types/dto'

export type ToolCallMessageExt = dto.ToolCallMessage & {
  status: 'completed' | 'need-auth' | 'running'
}

export type MessageExt =
  | dto.UserMessage
  | dto.AssistantMessage
  | dto.DebugMessage
  | dto.ToolCallAuthRequestMessage
  | dto.ToolCallAuthResponseMessage
  | dto.ToolOutputMessage
  | ToolCallMessageExt
  | dto.ToolResultMessage
  | dto.ErrorMessage
  | dto.UnsentMessage

export interface MessageGroup {
  actor: 'user' | 'assistant'
  messages: MessageExt[]
}

// Extract from a message tree, the thread, i.e. a linear sequence of messages,
// ending with the most recent message
export const flatten = (messages: dto.MessageEx[]) => {
  if (messages.length == 0) {
    return []
  }
  const nonLeaves = new Set<string>()
  const leaves = new Array<dto.MessageEx>()
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

  const flattened: dto.MessageEx[] = []
  const messagesById = new Map(messages.map((obj) => [obj.id, obj]))
  let msg: dto.MessageEx | null | undefined = oldestLeaf
  flattened.push(oldestLeaf)
  while (msg.parent && (msg = messagesById.get(msg.parent))) {
    flattened.push(msg)
  }
  flattened.reverse()
  return flattened
}

export const makeGroup = (actor: 'user' | 'assistant', messages: dto.MessageEx[]): MessageGroup => {
  const messageExts: MessageExt[] = []
  const pendingToolCalls = new Map<string, ToolCallMessageExt>()
  const pendingAuthorizationReq = new Map<string, string>()
  for (const msg of messages) {
    let msgExt: MessageExt
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
    messageExts.push(msgExt)
  }
  return {
    actor,
    messages: messageExts,
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
export const groupMessages = (messages: dto.MessageEx[]) => {
  const result: MessageGroup[] = []
  let currentGroupActor: 'user' | 'assistant' | undefined
  let currentGroupMessages: dto.MessageEx[] = []
  for (const message of messages) {
    const isUser = message.role == 'user' || message.role == 'unsent'
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

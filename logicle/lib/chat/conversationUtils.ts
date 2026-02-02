import {
  UIAssistantMessage,
  IMessageGroup,
  IUserMessageGroup,
  MessageWithError,
  UIMessage,
  UIToolCallPart,
  UIReasoningPart,
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
  if (messages.length === 0) {
    return []
  }
  const nonLeaves = new Set<string>()
  const leaves: MessageWithError[] = []
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
    messages.find((m) => m.id === leafMessage) ??
    leaves.reduce((a, b) => (a.sentAt > b.sentAt ? a : b))

  const flattened: MessageWithError[] = []
  const messagesById = new Map(messages.map((obj) => [obj.id, obj]))
  let msg: MessageWithError | null | undefined = targetLeaf
  flattened.push(targetLeaf)
  while (msg.parent) {
    msg = messagesById.get(msg.parent)
    if (!msg) break
    flattened.push(msg)
  }
  flattened.reverse()
  return flattened
}

const findChildren = (allMessages: MessageWithError[], msgId: string | null) => {
  const siblings = allMessages.filter((m) => m.parent === msgId)
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

const extractReasoningTitle = (text: string) => {
  const raw = text ?? ''
  const lines = raw.split(/\r?\n/)
  const first = (lines[0] ?? '').trim()

  // Case A: full-line bold => ** Title **
  const fullBoldMatch = first.match(/^\*\*(.+?)\*\*$/)
  if (fullBoldMatch) {
    return {
      title: fullBoldMatch[1].trim(),
      body: lines.slice(1).join('\n').trimStart(),
    }
  }

  // Case B: starts with ** but no closing ** yet (incomplete header)
  const startsBold = /^\*\*/.test(first)
  const hasClosingAfterStart = first.slice(2).includes('**')
  if (startsBold && !hasClosingAfterStart) {
    // Keep default title ("Reasoning"), clear body while streaming that first line
    return {
      body: '',
    }
  }

  // Fallback: default title + full body
  return {
    body: raw,
  }
}

const makeAssistantGroup = (
  messages: MessageWithError[],
  allMessages: MessageWithError[],
  streamingPart?: dto.MessagePart
): IMessageGroup => {
  const UIMessages: UIMessage[] = []
  const pendingToolCalls = new Map<string, UIToolCallPart>()
  const pendingAuthorizationReq = new Map<string, string>()
  for (const msg of messages) {
    let msgExt: UIMessage
    if (msg.role === 'assistant') {
      const uiAssistantMessage = {
        ...msg,
        parts: msg.parts.map((part) => {
          if (part.type === 'tool-call') {
            return {
              ...part,
              status: 'running',
            } satisfies UIToolCallPart
          } else if (part.type === 'text') {
            return {
              ...part,
              running: streamingPart === part,
            }
          } else if (part.type === 'reasoning') {
            const { body, title } = extractReasoningTitle(part.reasoning)
            return {
              ...part,
              reasoning: body,
              title,
              running: streamingPart === part,
            } satisfies UIReasoningPart
          } else if (part.type === 'builtin-tool-call') {
            return {
              ...part,
              status: 'running',
              type: 'tool-call',
            } satisfies UIToolCallPart
          } else {
            return part
          }
        }),
      } satisfies UIAssistantMessage
      const toolCalls = uiAssistantMessage.parts.filter((b) => b.type === 'tool-call')
      toolCalls.forEach((toolCall) => {
        pendingToolCalls.set(toolCall.toolCallId, toolCall)
      })
      msgExt = uiAssistantMessage
      for (const part of msg.parts) {
        if (part.type === 'builtin-tool-result') {
          const related = pendingToolCalls.get(part.toolCallId)
          if (related) {
            related.status = 'completed'
            related.result = part
          }
        }
      }
    } else {
      msgExt = msg
      if (msg.role === 'tool') {
        msg.parts.forEach((part) => {
          if (part.type === 'tool-result') {
            const related = pendingToolCalls.get(part.toolCallId)
            if (related) {
              related.status = 'completed'
              related.result = part
            }
          }
        })
      }
      if (msg.role === 'user-request') {
        if (!msg.request) {
          UIMessages.push(msgExt)
          continue
        }
        const toolCallId =
          msg.request.type === 'tool-call-authorization'
            ? msg.request.toolCallId
            : msg.request.type === 'mcp-oauth' && msg.request.pendingAction
              ? msg.request.pendingAction.toolCall.toolCallId
              : undefined
        if (toolCallId) {
          const related = pendingToolCalls.get(toolCallId)
          if (related) {
            related.status = 'need-auth'
            pendingAuthorizationReq.set(msg.id, toolCallId)
          }
        }
      }
      if (msg.role === 'user-response') {
        const toolCallId = pendingAuthorizationReq.get(msg.parent ?? '')
        if (toolCallId) {
          const related = pendingToolCalls.get(toolCallId)
          if (related) {
            related.status = 'running'
          }
        }
      }
    }
    UIMessages.push(msgExt)
  }
  return {
    actor: 'assistant',
    messages: UIMessages,
    siblings: findChildren(allMessages, UIMessages[0].parent),
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
  targetLeaf?: string,
  streamingPart?: dto.MessagePart
): IMessageGroup[] => {
  const flattened = flatten(messages_, targetLeaf)
  const groups: IMessageGroup[] = []
  let currentAssistantMessages: MessageWithError[] | undefined
  for (const message of flattened) {
    if (message.role === 'user') {
      if (currentAssistantMessages) {
        groups.push(makeAssistantGroup(currentAssistantMessages, messages_, streamingPart))
      }
      currentAssistantMessages = undefined
      groups.push(makeUserGroup(message, messages_))
    } else {
      currentAssistantMessages = currentAssistantMessages ?? []
      currentAssistantMessages.push(message)
    }
  }
  if (currentAssistantMessages) {
    groups.push(makeAssistantGroup(currentAssistantMessages, messages_, streamingPart))
  }
  return groups
}

export const getMessageAndDescendants = (messageId: string, inMessages: MessageWithError[]) => {
  const map = new Map(inMessages.map((m) => [m.id, m]))
  const result: MessageWithError[] = []
  for (const message of inMessages) {
    let search: MessageWithError | null = message
    while (search) {
      if (search.id === messageId) {
        result.push(message)
        break
      }
      if (!search.parent) {
        break
      }
      search = map.get(search.parent) ?? null
    }
  }
  return result
}

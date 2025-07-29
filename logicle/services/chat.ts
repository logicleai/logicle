import { fetchEventSource } from '@microsoft/fetch-event-source'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { ConversationWithMessages, MessageWithError } from '@/lib/chat/types'

export const appendMessage = function (
  conversation: ConversationWithMessages,
  msg: MessageWithError
): ConversationWithMessages {
  return {
    ...conversation,
    messages: [...conversation.messages, msg],
  }
}

class BackendError extends Error {}

export const fetchChatResponse = async (
  location: string,
  headers: Record<string, string>,
  body: string,
  conversation: ConversationWithMessages,
  userMsg: dto.Message,
  setChatStatus: (chatStatus: ChatStatus) => void,
  setConversation: (conversationWithMessages: ConversationWithMessages) => void,
  translation: (msg: string) => string
) => {
  let currentResponse: dto.Message | undefined
  let conversationWithoutUserMessage = conversation

  conversation = appendMessage(conversation, userMsg)
  setConversation(conversation)

  const abortController = new AbortController()
  setChatStatus({ state: 'sending', messageId: userMsg.id, abortController })
  try {
    await fetchEventSource(location, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      signal: abortController.signal,
      body,
      openWhenHidden: true,
      onmessage(ev) {
        const msg = JSON.parse(ev.data) as dto.TextStreamPart
        if (msg.type == 'text-start') {
          if (!currentResponse || currentResponse.role != 'assistant') {
            throw new BackendError('Received reasoning-start but no active assistant message')
          }
          currentResponse = {
            ...currentResponse,
            parts: [...currentResponse.parts, { type: 'text', text: '' }],
          }
        } else if (msg.type == 'delta') {
          if (!currentResponse || currentResponse.role != 'assistant') {
            throw new BackendError('Received reasoning but no valid reasoning block available')
          }
          const parts = currentResponse.parts
          const lastPart = parts[parts.length - 1]
          if (lastPart.type != 'text') {
            throw new BackendError('Received reasoning but last block is not reasoning')
          }
          currentResponse = {
            ...currentResponse,
            parts: [
              ...currentResponse.parts.slice(0, -1),
              { ...lastPart, text: lastPart.text + msg.text },
            ],
          }
        } else if (msg.type == 'reasoning-start') {
          if (!currentResponse || currentResponse.role != 'assistant') {
            throw new BackendError('Received reasoning-start but no active assistant message')
          }
          currentResponse = {
            ...currentResponse,
            parts: [...currentResponse.parts, { type: 'reasoning', reasoning: '' }],
          }
        } else if (msg.type == 'reasoning') {
          if (!currentResponse || currentResponse.role != 'assistant') {
            throw new BackendError('Received reasoning but no valid reasoning block available')
          }
          const parts = currentResponse.parts
          const lastPart = parts[parts.length - 1]
          if (lastPart.type != 'reasoning') {
            throw new BackendError('Received reasoning but last block is not reasoning')
          }
          currentResponse = {
            ...currentResponse,
            parts: [
              ...currentResponse.parts.slice(0, -1),
              { ...lastPart, reasoning: lastPart.reasoning + msg.reasoning },
            ],
          }
        } else if (msg.type == 'newMessage') {
          if (currentResponse) {
            // We're starting a new Message... just add the current one
            // which is complete!
            conversation = appendMessage(conversation, currentResponse)
          }
          currentResponse = msg.msg
          setChatStatus({ state: 'receiving', messageId: currentResponse.id, abortController })
        } else if (msg.type == 'tool-call') {
          if (!currentResponse || currentResponse.role != 'assistant') {
            throw new BackendError('Received tool call in invalid state')
          }
          currentResponse = {
            ...currentResponse,
            parts: [...currentResponse.parts, { ...msg, type: 'tool-call' }],
          }
        } else if (msg.type == 'tool-call-result') {
          if (!currentResponse || currentResponse.role != 'assistant') {
            throw new BackendError('Received toolCall in invalid state')
          }
          currentResponse = {
            ...currentResponse,
            parts: [...currentResponse.parts, { type: 'tool-result', ...msg.toolCallResult }],
          }
        } else if (msg.type == 'summary') {
          void mutate('/api/conversations')
          conversation = {
            ...conversation,
            name: msg.summary,
          }
        } else if (msg.type == 'attachment') {
          if (!currentResponse) {
            throw new BackendError('Received toolCallAuthRequest before response')
          }
          const attachments = [...currentResponse.attachments, msg.attachment]
          currentResponse = {
            ...currentResponse!,
            attachments,
          }
        } else if (msg.type == 'citations') {
          if (!currentResponse) {
            throw new BackendError('Received citations before response')
          }
          currentResponse = {
            ...currentResponse,
            citations: [...(currentResponse.citations ?? []), ...msg.citations],
          }
        } else {
          throw new BackendError(`Unsupported message type '${msg['type']}`)
        }
        if (currentResponse) {
          setConversation(appendMessage(conversation, currentResponse))
        } else {
          setConversation(conversation)
        }
      },
      async onopen(response) {
        if (response.ok && response.headers.get('content-type') === 'text/event-stream') {
          return // everything's good
        } else if (response.status == 403) {
          throw new BackendError('failed_sending_message_not_authorized')
        } else {
          throw new BackendError('failed_sending_message')
        }
      },
      onclose() {
        // it is expected that the server closes the connection
        return
      },
      onerror(err) {
        throw err // rethrow to stop the operation
      },
    })
  } catch (e: any) {
    if (!currentResponse) {
      setConversation(
        appendMessage(conversationWithoutUserMessage, {
          ...userMsg,
          error: translation(e instanceof BackendError ? e.message : 'chat_response_failure'),
        })
      )
    } else {
      setConversation(
        appendMessage(conversation, {
          ...currentResponse,
          error: 'chat_response_failure',
        })
      )
    }
  }
  setChatStatus({ state: 'idle' })
}

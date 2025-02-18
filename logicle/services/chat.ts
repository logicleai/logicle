import { fetchEventSource } from '@microsoft/fetch-event-source'
import toast from 'react-hot-toast'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'
import { mutate } from 'swr'

export const appendMessage = function (
  conversation: dto.ConversationWithMessages,
  msg: dto.MessageEx
): dto.ConversationWithMessages {
  return {
    ...conversation,
    messages: [...conversation.messages, msg],
  }
}

export const fetchChatResponse = async (
  location: string,
  body: string,
  conversation: dto.ConversationWithMessages,
  userMsg: dto.Message,
  setChatStatus: (chatStatus: ChatStatus) => void,
  setConversation: (conversationWithMessages: dto.ConversationWithMessages) => void,
  translation: (msg: string) => string
) => {
  let currentResponse: dto.Message | undefined
  let conversationBase = conversation

  conversation = appendMessage(conversation, userMsg)
  setConversation(conversation)

  const abortController = new AbortController()
  setChatStatus({ state: 'sending', messageId: userMsg.id, abortController })
  try {
    await fetchEventSource(location, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: abortController.signal,
      body,
      openWhenHidden: true,
      onmessage(ev) {
        const msg = JSON.parse(ev.data) as dto.TextStreamPart
        if (msg.type == 'delta') {
          if (!currentResponse) {
            throw new Error('Received delta before response')
          }
          currentResponse = {
            ...currentResponse,
            content: currentResponse.content + msg.content,
          }
        } else if (msg.type == 'newMessage') {
          if (currentResponse) {
            // We're starting a new Message... just add the current one
            // which is complete!
            conversation = appendMessage(conversation, currentResponse)
          }
          currentResponse = msg.content
          setChatStatus({ state: 'receiving', messageId: currentResponse.id, abortController })
        } else if (msg.type == 'toolCall') {
          if (!currentResponse) {
            throw new Error('Received toolCall before response')
          }
          currentResponse = {
            ...currentResponse,
            role: 'tool-call',
            ...msg.content,
          }
        } else if (msg.type == 'summary') {
          void mutate('/api/conversations')
          conversation = {
            ...conversation,
            name: msg.content,
          }
        } else if (msg.type == 'attachment') {
          if (!currentResponse) {
            throw new Error('Received toolCallAuthRequest before response')
          }
          const attachments = [...currentResponse.attachments, msg.content]
          currentResponse = {
            ...currentResponse!,
            attachments,
          }
        } else if (msg.type == 'citations') {
          if (!currentResponse) {
            throw new Error('Received toolCallAuthRequest before response')
          }
          currentResponse = {
            ...currentResponse!,
            citations: msg.content,
          }
        } else {
          throw new Error(`Unsupported message type '${msg['type']}`)
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
          setConversation(
            appendMessage(conversationBase, {
              ...userMsg,
              role: 'unsent',
              reason: 'failed_sending_message_not_authorized',
            })
          )
        } else {
          setConversation(
            appendMessage(conversationBase, {
              ...userMsg,
              role: 'unsent',
              reason: 'failed_sending_message',
            })
          )
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
  } catch (e) {
    toast.error(`Message failure ${e}`)
  }
  setChatStatus({ state: 'idle' })
}

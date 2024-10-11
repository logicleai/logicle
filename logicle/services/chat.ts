import { nanoid } from 'nanoid'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import toast from 'react-hot-toast'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'
import { mutate } from 'swr'

export const appendMessage = function (
  conversation: dto.ConversationWithMessages,
  msg: dto.Message
): dto.ConversationWithMessages {
  const updatedMessages: dto.Message[] = [...conversation.messages, msg]
  return {
    ...conversation,
    messages: updatedMessages,
  }
}

export const fetchChatResponse = async (
  location: string,
  body: string,
  conversation: dto.ConversationWithMessages,
  userMsgId: string,
  setChatStatus: (chatStatus: ChatStatus) => void,
  setConversation: (conversationWithMessages: dto.ConversationWithMessages) => void
) => {
  let currentResponse: dto.Message | undefined
  //setConversation(appendMessage(conversation, currentResponse))

  const abortController = new AbortController()
  setChatStatus({ state: 'sending', messageId: userMsgId, abortController })
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
        } else if (msg.type == 'toolCallAuthRequest') {
          if (!currentResponse) {
            throw new Error('Received toolCallAuthRequest before response')
          }
          currentResponse = {
            ...currentResponse,
            toolCallAuthRequest: msg.content,
            content: 'Require-confirm',
          }
        } else if (msg.type == 'toolCall') {
          if (!currentResponse) {
            throw new Error('Received toolCallAuthRequest before response')
          }
          currentResponse = {
            ...currentResponse,
            toolCall: msg.content,
            content: 'Tool-call',
          }
        } else if (msg.type == 'summary') {
          mutate('/api/conversations')
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
        } else {
          throw 'chat failure'
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

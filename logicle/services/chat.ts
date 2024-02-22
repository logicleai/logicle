import { ConversationWithMessages, MessageDTO } from '@/types/chat'
import { nanoid } from 'nanoid'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import toast from 'react-hot-toast'
import { ChatStatus } from '@/app/chat/components/ChatStatus'

export const appendMessage = function (
  conversation: ConversationWithMessages,
  msg: MessageDTO
): ConversationWithMessages {
  const updatedMessages: MessageDTO[] = [...conversation.messages, msg]
  return {
    ...conversation,
    messages: updatedMessages,
  }
}

export const fetchChatResponse = async (
  location: string,
  body: string,
  conversation: ConversationWithMessages,
  userMsgId: string,
  setChatStatus: (chatStatus: ChatStatus) => void,
  setConversation: (conversationWithMessages: ConversationWithMessages) => void
) => {
  let assistantResponse: MessageDTO = {
    id: nanoid(), // this is just a placeholder. It will be replaced
    role: 'assistant',
    content: '',
    attachments: [],
    conversationId: conversation.id,
    parent: userMsgId,
    sentAt: new Date().toISOString(),
  }
  const conversationWithResponse = appendMessage(conversation, assistantResponse)
  setConversation(conversationWithResponse)

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
        const msg = JSON.parse(ev.data)
        if (msg.type == 'delta') {
          assistantResponse = {
            ...assistantResponse,
            content: assistantResponse.content + msg.content,
          }
        } else {
          assistantResponse = msg.content
          setChatStatus({ state: 'receiving', messageId: assistantResponse.id, abortController })
        }
        const conversationWithResponse = appendMessage(conversation!, assistantResponse)
        setConversation(conversationWithResponse)
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

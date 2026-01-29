import { fetchEventSource } from '@microsoft/fetch-event-source'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { ConversationWithMessages } from '@/lib/chat/types'
import { applyStreamPartToMessages } from '@/lib/chat/streamApply'
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
  const conversationWithoutUserMessage = conversation

  conversation = {
    ...conversation,
    messages: applyStreamPartToMessages(conversation.messages, { type: 'message', msg: userMsg }),
  }
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
        if (msg.type === 'summary') {
          void mutate('/api/conversations')
          conversation = {
            ...conversation,
            name: msg.summary,
          }
          setConversation(conversation)
          return
        }
        try {
          conversation = {
            ...conversation,
            messages: applyStreamPartToMessages(conversation.messages, msg),
          }
        } catch (e) {
          throw new BackendError(e instanceof Error ? e.message : 'Invalid stream part')
        }
        currentResponse = conversation.messages[conversation.messages.length - 1]
        if (msg.type === 'message') {
          setChatStatus({ state: 'receiving', messageId: currentResponse.id, abortController })
        }
        setConversation(conversation)
      },
      async onopen(response) {
        if (response.ok && response.headers.get('content-type') === 'text/event-stream') {
          return // everything's good
        } else if (response.status === 403) {
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
    console.error(e)
    const lastIndex = conversation.messages.length - 1
    setConversation({
      ...conversation,
      messages: [
        ...conversation.messages.slice(0, lastIndex),
        {
          ...conversation.messages[lastIndex],
          error: translation(e instanceof BackendError ? e.message : 'chat_response_failure'),
        },
      ],
    })
  }
  setChatStatus({ state: 'idle' })
}

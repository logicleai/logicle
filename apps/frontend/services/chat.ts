import { fetchEventSource } from '@microsoft/fetch-event-source'
import { get, post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
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
  conversation = {
    ...conversation,
    messages: applyStreamPartToMessages(conversation.messages, { type: 'message', msg: userMsg }),
  }
  setConversation(conversation)

  const abortController = new AbortController()
  setChatStatus({ state: 'sending', messageId: userMsg.id })
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
        } catch (error) {
          throw new BackendError(error instanceof Error ? error.message : 'Invalid stream part')
        }
        setConversation(conversation)
        if (msg.type === 'message') {
          setChatStatus({
            state: 'receiving',
            runId: 'preview',
            messageId: msg.msg.id,
            abortController,
          })
        }
      },
      async onopen(response) {
        const contentType = response.headers.get('content-type') ?? ''
        if (response.ok && contentType.startsWith('text/event-stream')) {
          return
        } else if (response.status === 403) {
          throw new BackendError('failed_sending_message_not_authorized')
        } else {
          throw new BackendError('failed_sending_message')
        }
      },
      onclose() {
        return
      },
      onerror(error) {
        throw error
      },
    })
  } catch (error: any) {
    console.error(error)
    const lastIndex = conversation.messages.length - 1
    setConversation({
      ...conversation,
      messages: [
        ...conversation.messages.slice(0, lastIndex),
        {
          ...conversation.messages[lastIndex],
          error: translation(
            error instanceof BackendError ? error.message : 'chat_response_failure'
          ),
        },
      ],
    })
  }
  setChatStatus({ state: 'idle' })
}

export const startChatRun = async (message: dto.Message) => {
  return await post<dto.ChatRun>('/api/chat/runs', message)
}

export const getActiveChatRun = async (conversationId: string) => {
  return await get<dto.ActiveChatRunResponse>(`/api/conversations/${conversationId}/active-run`)
}

export const stopChatRun = async (runId: string) => {
  return await post<dto.ChatRun>(`/api/chat/runs/${runId}/stop`)
}

export const subscribeToChatRun = async ({
  runId,
  afterSequence = 0,
  signal,
  onEvent,
  onOpen,
  onClose,
}: {
  runId: string
  afterSequence?: number
  signal: AbortSignal
  onEvent: (event: dto.TextStreamPart, sequence: number) => void
  onOpen?: () => void
  onClose?: () => void
}) => {
  await fetchEventSource(`/api/chat/runs/${runId}/events?afterSequence=${afterSequence}`, {
    method: 'GET',
    signal,
    openWhenHidden: true,
    async onopen(response) {
      const contentType = response.headers.get('content-type') ?? ''
      if (response.ok && contentType.startsWith('text/event-stream')) {
        onOpen?.()
        return
      }
      throw new Error('Failed subscribing to chat run')
    },
    onmessage(ev) {
      onEvent(JSON.parse(ev.data) as dto.TextStreamPart, ev.id ? Number(ev.id) : afterSequence)
    },
    onclose() {
      onClose?.()
    },
    onerror(error) {
      throw error
    },
  })
}

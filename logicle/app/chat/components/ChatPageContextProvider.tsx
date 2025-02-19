'use client'
import ChatPageContext, { SendMessageParams } from '@/app/chat/components/context'
import { ChatPageState } from '@/app/chat/components/state'
import { useCreateReducer } from '@/hooks/useCreateReducer'
import { FC, ReactNode, useRef } from 'react'
import { ChatStatus } from './ChatStatus'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'
import { fetchChatResponse } from '@/services/chat'
import { useTranslation } from 'react-i18next'
import { ConversationWithMessages } from '@/lib/chat/types'

interface Props {
  children: ReactNode
  initialState: ChatPageState
}

interface RunningChatState {
  conversationWithMessages: ConversationWithMessages
  chatStatus: ChatStatus
}

export const ChatPageContextProvider: FC<Props> = ({ initialState, children }) => {
  const contextValue = useCreateReducer<ChatPageState>({
    initialState: initialState,
  })

  const {
    state: { chatStatus, selectedConversation },
    dispatch,
  } = contextValue

  const nonStateSelectedConversation = useRef<string | undefined>()
  const runningChats = useRef<Map<string, RunningChatState>>(new Map<string, RunningChatState>())
  console.debug(`
    running chats: ${runningChats.current.keys().toArray()}
    selected conversation: ${selectedConversation?.id}
    chatState: ${JSON.stringify(chatStatus)}`)
  const { t } = useTranslation()

  const setNewChatAssistantId = (assistantId: string | null) => {
    dispatch({ field: 'newChatAssistantId', value: assistantId })
  }

  const setSelectedConversation = (conversation: ConversationWithMessages | undefined) => {
    const conversationId = conversation?.id
    nonStateSelectedConversation.current = conversationId
    if (conversationId) {
      const state = runningChats.current.get(conversationId)
      if (state) {
        dispatch({ field: 'selectedConversation', value: state.conversationWithMessages })
        dispatch({ field: 'chatStatus', value: state.chatStatus })
        return
      }
    }
    dispatch({ field: 'selectedConversation', value: conversation })
    dispatch({ field: 'chatStatus', value: { state: 'idle' } })
  }

  const setChatInput = (chatInput: string) => {
    dispatch({ field: 'chatInput', value: chatInput })
  }

  // CONVERSATION OPERATIONS  --------------------------------------------

  const createDtoMessage = (
    msg: SendMessageParams['msg'],
    conversationId: string,
    parent: string | null
  ): dto.Message => {
    if (msg.role == 'user') {
      return {
        ...msg,
        attachments: msg.attachments || [],
        id: nanoid(),
        conversationId,
        role: msg.role,
        parent,
        sentAt: new Date().toISOString(),
      }
    } else {
      return {
        ...msg,
        id: nanoid(),
        content: '',
        attachments: [],
        conversationId,
        role: msg.role,
        parent,
        sentAt: new Date().toISOString(),
      }
    }
  }

  const sendMessage = async ({ msg, repeating, conversation }: SendMessageParams) => {
    let parent: string | null = null
    conversation = conversation ?? selectedConversation
    if (!conversation) {
      return
    } else if (repeating) {
      parent = repeating.parent
    } else {
      for (const message of conversation.messages.slice().reverse()) {
        // Find the most recent message which is not a user message...
        // It can happen that the most recent message is a user message,
        // if no response is received.
        if (message.role != 'user') {
          parent = message.id
          break
        }
      }
    }
    const userMessage = createDtoMessage(msg, conversation.id, parent)
    try {
      runningChats.current.set(conversation.id, {
        conversationWithMessages: conversation,
        chatStatus: { state: 'idle' },
      })
      await fetchChatResponse(
        '/api/chat',
        JSON.stringify(userMessage),
        conversation,
        userMessage,
        (chatStatus: ChatStatus) => {
          runningChats.current.get(conversation.id)!.chatStatus = chatStatus
          if (conversation.id == nonStateSelectedConversation.current) {
            dispatch({
              field: 'chatStatus',
              value: chatStatus,
            })
          }
        },
        (conversationWithMessages: ConversationWithMessages) => {
          runningChats.current.get(conversation.id)!.conversationWithMessages =
            conversationWithMessages
          if (conversation.id == nonStateSelectedConversation.current) {
            dispatch({
              field: 'selectedConversation',
              value: conversationWithMessages,
            })
          }
        },
        t
      )
    } finally {
      runningChats.current.delete(conversation.id)
    }
  }

  // EFFECTS  --------------------------------------------

  return (
    <ChatPageContext.Provider
      value={{
        ...contextValue,
        setChatInput,
        setSelectedConversation,
        setNewChatAssistantId,
        sendMessage,
      }}
    >
      {children}
    </ChatPageContext.Provider>
  )
}

'use client'
import ChatPageContext, { SendMessageParams, SideBarContent } from '@/app/chat/components/context'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'
import { useCreateReducer } from '@/hooks/useCreateReducer'
import { FC, ReactNode, useCallback, useRef } from 'react'
import { ChatStatus } from './ChatStatus'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'
import { fetchChatResponse } from '@/services/chat'
import { useTranslation } from 'react-i18next'
import { ConversationWithMessages } from '@/lib/chat/types'
import { useUserProfile } from '@/components/providers/userProfileContext'

interface Props {
  children: ReactNode
}

interface RunningChatState {
  conversationWithMessages: ConversationWithMessages
  chatStatus: ChatStatus
}

export const ChatPageContextProvider: FC<Props> = ({ children }) => {
  const userProfile = useUserProfile()
  const contextValue = useCreateReducer<ChatPageState>({
    initialState: {
      ...defaultChatPageState,
      newChatAssistantId: userProfile?.lastUsedAssistant?.id ?? null,
    },
  })

  const {
    state: { selectedConversation },
    dispatch,
  } = contextValue

  const nonStateSelectedConversation = useRef<string | undefined>()
  const runningChats = useRef<Map<string, RunningChatState>>(new Map<string, RunningChatState>())
  const { t, i18n } = useTranslation()

  // Memoized function to prevent re-renders
  const setNewChatAssistantId = useCallback(
    (assistantId: string | null) => {
      dispatch({ field: 'newChatAssistantId', value: assistantId })
    },
    [dispatch]
  )

  const setChatInputElement = useCallback(
    (element: HTMLTextAreaElement | null) => {
      dispatch({ field: 'chatInputElement', value: element })
    },
    [dispatch]
  )

  const setSideBarContent = useCallback(
    (content?: SideBarContent) => {
      dispatch({ field: 'sideBarContent', value: content })
    },
    [dispatch]
  )

  const setSelectedConversation = useCallback(
    (conversation: ConversationWithMessages | undefined) => {
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
    },
    [dispatch]
  )

  // CONVERSATION OPERATIONS  --------------------------------------------
  const createDtoMessage = (
    msg: SendMessageParams['msg'],
    conversationId: string,
    parent: string | null
  ): dto.Message => {
    if (msg.role === 'user') {
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
        conversationId,
        role: msg.role,
        parent,
        sentAt: new Date().toISOString(),
      }
    }
  }

  const sendMessage = async ({ msg, repeating, conversation }: SendMessageParams) => {
    setSideBarContent(undefined)
    let parent: string | null = null
    conversation = conversation ?? selectedConversation
    if (!conversation) {
      return
    } else if (repeating) {
      parent = repeating.parent
    } else if (conversation.targetLeaf) {
      parent = conversation.targetLeaf
    } else {
      for (const message of conversation.messages.slice().reverse()) {
        // Find the most recent message which is not a user message...
        // It can happen that the most recent message is a user message,
        // if no response is received.
        if (message.role !== 'user') {
          parent = message.id
          break
        }
      }
    }
    conversation.targetLeaf = undefined
    const userMessage = createDtoMessage(msg, conversation.id, parent)
    try {
      runningChats.current.set(conversation.id, {
        conversationWithMessages: conversation,
        chatStatus: { state: 'idle' },
      })
      await fetchChatResponse(
        '/api/chat',
        { 'Accept-Language': `${i18n.language};q=1.0, en;q=0.8, *;q=0.5` },
        JSON.stringify(userMessage),
        conversation,
        userMessage,
        (chatStatus: ChatStatus) => {
          runningChats.current.get(conversation.id)!.chatStatus = chatStatus
          if (conversation.id === nonStateSelectedConversation.current) {
            dispatch({
              field: 'chatStatus',
              value: chatStatus,
            })
          }
        },
        (conversationWithMessages: ConversationWithMessages) => {
          runningChats.current.get(conversation.id)!.conversationWithMessages =
            conversationWithMessages
          if (conversation.id === nonStateSelectedConversation.current) {
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

  return (
    <ChatPageContext.Provider
      value={{
        ...contextValue,
        setSelectedConversation,
        setNewChatAssistantId,
        sendMessage,
        setChatInputElement,
        setSideBarContent,
      }}
    >
      {children}
    </ChatPageContext.Provider>
  )
}

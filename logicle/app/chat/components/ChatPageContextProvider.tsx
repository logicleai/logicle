'use client'
import ChatPageContext, { SendMessageParams } from '@/app/chat/components/context'
import { ChatPageState } from '@/app/chat/components/state'
import { useCreateReducer } from '@/hooks/useCreateReducer'
import { FC, ReactNode } from 'react'
import { ChatStatus } from './ChatStatus'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'
import { appendMessage, fetchChatResponse } from '@/services/chat'
import { useTranslation } from 'react-i18next'

interface Props {
  children: ReactNode
  initialState: ChatPageState
}

export const ChatPageContextProvider: FC<Props> = ({ initialState, children }) => {
  const contextValue = useCreateReducer<ChatPageState>({
    initialState: initialState,
  })

  const {
    state: { selectedConversation },
    dispatch,
  } = contextValue

  const { t } = useTranslation()

  //console.debug(`rendering ChatPageContextProvider, selected = ${selectedConversation?.id}`)

  const setNewChatAssistantId = (assistantId: string | null) => {
    dispatch({ field: 'newChatAssistantId', value: assistantId })
  }

  const setSelectedConversation = (conversation: dto.ConversationWithMessages | undefined) => {
    dispatch({ field: 'selectedConversation', value: conversation })
  }

  const setChatInput = (chatInput: string) => {
    dispatch({ field: 'chatInput', value: chatInput })
  }

  const setChatStatus = (chatStatus: ChatStatus) => {
    dispatch({ field: 'chatStatus', value: chatStatus })
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

  const handleSend = async ({ msg, repeating, conversation }: SendMessageParams) => {
    let parent: string | null = null
    conversation = conversation ?? selectedConversation
    if (!conversation) {
      return
    } else if (repeating) {
      parent = repeating.parent
    } else if (conversation.messages.length != 0) {
      parent = conversation.messages[conversation.messages.length - 1].id
    }
    const userMessage = createDtoMessage(msg, conversation.id, parent)
    await fetchChatResponse(
      '/api/chat',
      JSON.stringify(userMessage),
      conversation,
      userMessage,
      setChatStatus,
      setSelectedConversation,
      t
    )
  }

  // EFFECTS  --------------------------------------------

  return (
    <ChatPageContext.Provider
      value={{
        ...contextValue,
        setChatStatus,
        setChatInput,
        setSelectedConversation,
        setNewChatAssistantId,
        handleSend,
      }}
    >
      {children}
    </ChatPageContext.Provider>
  )
}

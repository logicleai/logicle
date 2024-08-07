'use client'
import ChatPageContext, { SendMessageParams } from '@/app/chat/components/context'
import { ChatPageState } from '@/app/chat/components/state'
import { useCreateReducer } from '@/hooks/useCreateReducer'
import { FC, ReactNode } from 'react'
import { ChatStatus } from './ChatStatus'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'
import { appendMessage, fetchChatResponse } from '@/services/chat'

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

  //console.debug(`rendering ChatPageContextProvider, selected = ${selectedConversation?.id}`)

  const setChatStatus = (chatStatus: ChatStatus) => {
    dispatch({ field: 'chatStatus', value: chatStatus })
  }

  const setConversation = (conversation: dto.ConversationWithMessages) => {
    dispatch({ field: 'selectedConversation', value: conversation })
  }

  // CONVERSATION OPERATIONS  --------------------------------------------

  const handleSend = async ({
    role,
    content,
    confirmResponse,
    attachments,
    repeating,
    conversation,
  }: SendMessageParams) => {
    let parent: string | null = null
    conversation = conversation ?? selectedConversation
    if (!conversation) {
      return
    } else if (repeating) {
      parent = repeating.parent
    } else if (conversation.messages.length != 0) {
      parent = conversation.messages[conversation.messages.length - 1].id
    }
    const userMessage: dto.Message = {
      id: nanoid(),
      conversationId: conversation.id,
      role: role ?? 'user',
      content: content,
      attachments: attachments ?? [],
      parent: parent,
      sentAt: new Date().toISOString(),
      confirmResponse,
    }
    conversation = appendMessage(conversation, userMessage)
    dispatch({
      field: 'selectedConversation',
      value: conversation,
    })

    await fetchChatResponse(
      '/api/chat',
      JSON.stringify(userMessage),
      conversation,
      userMessage.id,
      setChatStatus,
      setConversation
    )
  }

  // EFFECTS  --------------------------------------------

  return (
    <ChatPageContext.Provider
      value={{
        ...contextValue,
        setChatStatus,
        handleSend,
      }}
    >
      {children}
    </ChatPageContext.Provider>
  )
}

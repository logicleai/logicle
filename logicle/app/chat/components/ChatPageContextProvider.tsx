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
    const userMessage = {
      ...msg,
      id: nanoid(),
      conversationId: conversation.id,
      role: msg.role ?? 'user',
      parent: parent,
      sentAt: new Date().toISOString(),
    } as dto.Message
    conversation = appendMessage(conversation, userMessage)
    setSelectedConversation(conversation)

    await fetchChatResponse(
      '/api/chat',
      JSON.stringify(userMessage),
      conversation,
      userMessage.id,
      setChatStatus,
      setSelectedConversation
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

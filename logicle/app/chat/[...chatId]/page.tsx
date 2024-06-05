'use client'
import React, { useContext, useEffect } from 'react'
import { Chat } from '@/app/chat/components/Chat'
import ChatPageContext from '@/app/chat/components/context'
import { useParams } from 'next/navigation'
import { getConversation, getConversationMessages } from '@/services/conversation'
import toast from 'react-hot-toast'
import AssistantDescription from '../components/AssistantDescription'
import { useSWRJson } from '@/hooks/swr'
import { MainLayout } from '@/app/layouts/MainLayout'
import { Chatbar } from '../components/chatbar/Chatbar'
import * as dto from '@/types/dto'

const ChatPage = () => {
  const {
    state: { selectedConversation },
    dispatch,
  } = useContext(ChatPageContext)

  const { chatId } = useParams() as { chatId: string }

  useEffect(() => {
    // As ChatPageState.selectedConversation is shared by all chat pages, and kept
    // when routing between them, we must ensure that it matches the
    // page URL
    if (selectedConversation?.id != chatId) {
      const fetch = async () => {
        const conversation = await getConversation(chatId)
        if (conversation.error) {
          toast.error('Failed loading the chat')
          return
        }
        const messages = await getConversationMessages(chatId)
        if (messages.error) {
          toast.error('Failed loading the chat')
          return
        }
        const conversationWithMessages = {
          ...conversation.data,
          messages: messages.data,
        }
        dispatch({
          field: 'selectedConversation',
          value: conversationWithMessages,
        })
      }
      fetch()
    }
  }, [chatId, selectedConversation?.id, dispatch])

  const assistantId = selectedConversation?.assistantId
  const apiPath = `/api/user/assistants/${assistantId}`
  const { data: assistant } = useSWRJson<dto.UserAssistant>(apiPath)

  if (selectedConversation?.id != chatId || !assistant) {
    return <></>
  }
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AssistantDescription conversation={selectedConversation} />
      <Chat assistant={assistant} className="flex-1" />
    </div>
  )
}

const ChatPageWithSidebar = () => {
  return (
    <MainLayout leftBar={<Chatbar />}>
      <ChatPage></ChatPage>
    </MainLayout>
  )
}

export default ChatPageWithSidebar

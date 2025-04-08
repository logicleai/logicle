'use client'
import React, { useContext, useEffect } from 'react'
import { Chat } from '@/app/chat/components/Chat'
import ChatPageContext from '@/app/chat/components/context'
import { useParams } from 'next/navigation'
import { getConversation, getConversationMessages } from '@/services/conversation'
import toast from 'react-hot-toast'
import { ChatHeader } from '../components/ChatHeader'
import { useSWRJson } from '@/hooks/swr'
import * as dto from '@/types/dto'

const ChatPage = () => {
  const {
    state: { selectedConversation },
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const { chatId } = useParams() as { chatId: string }

  useEffect(() => {
    // As ChatPageState.selectedConversation is shared by all chat pages, and kept
    // when routing between them, we must ensure that it matches the
    // page URL
    if (selectedConversation?.id != chatId) {
      console.debug(
        `Loading messages for chat ${chatId} because selectedConversation is ${selectedConversation?.id}`
      )
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
        setSelectedConversation(conversationWithMessages)
      }
      void fetch()
    }
  }, [chatId, selectedConversation?.id, setSelectedConversation])

  const assistantId = selectedConversation?.assistantId
  const { data: assistant } = useSWRJson<dto.UserAssistantWithSupportedMedia>(
    `/api/user/assistants/${assistantId}`
  )

  if (selectedConversation?.id != chatId || !assistant) {
    return <></>
  }
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ChatHeader assistant={assistant} />
      <Chat assistant={assistant} className="flex-1" supportedMedia={assistant.supportedMedia} />
    </div>
  )
}

const ChatPageWithSidebar = () => {
  return <ChatPage></ChatPage>
}

export default ChatPageWithSidebar

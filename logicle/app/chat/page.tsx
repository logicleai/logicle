'use client'
import React, { useEffect, useState } from 'react'
import { useContext } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { ChatInput } from '@/app/chat/components/ChatInput'
import { createConversation } from '@/services/conversation'
import { useSession } from 'next-auth/react'
import { redirect, useRouter } from 'next/navigation'
import { mutate } from 'swr'
import { Attachment, UserAssistant } from '@/types/chat'
import { useSWRJson } from '@/hooks/swr'
import toast from 'react-hot-toast'
import { MainLayout } from '../layouts/MainLayout'
import { Chatbar } from './components/chatbar/Chatbar'
import { StartChatFromHere } from './components/StartChatFromHere'

const StartChat = () => {
  const {
    state: { selectedConversation, newChatAssistantId },
    handleSend,
    dispatch,
  } = useContext(ChatPageContext)

  // In order to start the chat faster, and avoid race conditions, we set the
  // selectedConversation state before routing to /chat/${conversation.id}
  // but... we must also disable the logic which resets the selectedConversation
  // when the component is first rendered

  // this will be set to true after pushing to the new route
  const [started, setStarted] = useState<boolean>(false)

  // this code will reset the selectedConversation if one is loaded
  useEffect(() => {
    if (!started && selectedConversation) {
      dispatch({ field: 'selectedConversation', value: undefined })
    }
  }, [started, selectedConversation, dispatch])

  const { data: session } = useSession()

  const router = useRouter()

  const assistantId = newChatAssistantId

  if (!assistantId) {
    redirect('/chat/select_assistant')
  }

  const swrAssistant = useSWRJson<UserAssistant>(`/api/user/assistants/${assistantId}`)

  const startChat = async (content: string, attachments: Attachment[]) => {
    const customName = content.length > 30 ? content.substring(0, 30) + '...' : content
    const result = await createConversation({
      name: customName,
      assistantId: assistantId,
      ownerId: session!.user.id,
    })
    if (result.error) {
      toast('Failed creating conversation')
    }
    const conversation = result.data
    // force a reload of the conversation list
    await mutate('/api/conversations')

    // create a new conversation without messages
    const conversationWithMessages = {
      ...conversation,
      messages: [],
    }
    setStarted(true)
    dispatch({ field: 'selectedConversation', value: conversationWithMessages })
    router.push(`/chat/${conversation.id}`)
    // We need to invoke handleSend with the newly created conversation
    // because context won't be propagated immediately.
    handleSend(content, attachments, undefined, conversationWithMessages)
  }

  if (!swrAssistant.data) {
    return <></>
  }
  const assistant = swrAssistant.data
  return (
    <div className="relative flex-1 overflow-hidden flex flex-col items-stretch justify-between">
      <StartChatFromHere className="flex-1" assistant={assistant}></StartChatFromHere>
      <ChatInput onSend={startChat} />
    </div>
  )
}

const StartChatWithSidebar = () => {
  return (
    <MainLayout leftBar={<Chatbar />}>
      <StartChat></StartChat>
    </MainLayout>
  )
}
export default StartChatWithSidebar

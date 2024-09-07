'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useContext } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { ChatInput } from '@/app/chat/components/ChatInput'
import { createConversation } from '@/services/conversation'
import { useSession } from 'next-auth/react'
import { redirect, useRouter } from 'next/navigation'
import { mutate } from 'swr'
import { useSWRJson } from '@/hooks/swr'
import toast from 'react-hot-toast'
import { StartChatFromHere } from './components/StartChatFromHere'
import * as dto from '@/types/dto'
import { useEnvironment } from '../context/environmentProvider'
import { useTranslation } from 'next-i18next'

const deriveChatTitle = (msg: string) => {
  return msg.length > 30 ? msg.substring(0, 30) + '...' : msg
}

const StartChat = () => {
  const env = useEnvironment()
  const {
    state: { selectedConversation, newChatAssistantId },
    handleSend,
    setChatInput,
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // In order to start the chat faster, and avoid race conditions, we set the
  // selectedConversation state before routing to /chat/${conversation.id}
  // but... we must also disable the logic which resets the selectedConversation
  // when the component is first rendered

  // this will be set to true after pushing to the new route
  const [started, setStarted] = useState<boolean>(false)

  // this code will reset the selectedConversation if one is loaded
  useEffect(() => {
    if (!started && selectedConversation) {
      setSelectedConversation(undefined)
    }
  }, [started, selectedConversation, setSelectedConversation])

  const { data: session } = useSession()

  const { t } = useTranslation('common')

  const router = useRouter()

  const assistantId = newChatAssistantId

  if (!assistantId) {
    redirect('/chat/assistants/select')
  }

  const swrAssistant = useSWRJson<dto.UserAssistant>(`/api/user/assistants/${assistantId}`)

  const startChat = async ({
    content,
    attachments,
  }: {
    content: string
    attachments: dto.Attachment[]
  }) => {
    const customName = env.enableAutoSummary ? t('new-chat') : deriveChatTitle(content)
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
    setSelectedConversation(conversationWithMessages)
    router.push(`/chat/${conversation.id}`)
    // We need to invoke handleSend with the newly created conversation
    // because context won't be propagated immediately.
    handleSend({ content, attachments, conversation: conversationWithMessages })
  }

  if (!swrAssistant.data) {
    return <></>
  }
  const assistant = swrAssistant.data
  return (
    <div className="relative flex-1 overflow-hidden flex flex-col items-stretch justify-between">
      <StartChatFromHere
        className="flex-1"
        assistant={assistant}
        onPrompt={(prompt) => {
          setChatInput(prompt)
          textareaRef?.current?.focus()
        }}
      ></StartChatFromHere>
      <ChatInput textAreaRef={textareaRef} onSend={startChat} />
    </div>
  )
}

const StartChatWithSidebar = () => {
  return <StartChat></StartChat>
}
export default StartChatWithSidebar

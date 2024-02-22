'use client'
import React, { useEffect, useState } from 'react'
import { useContext } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { ChatInput } from '@/app/chat/components/ChatInput'
import { createConversation } from '@/services/conversation'
import { useSession } from 'next-auth/react'
import { redirect, useRouter } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import { mutate } from 'swr'
import { Attachment, UserAssistant } from '@/types/chat'
import { useSWRJson } from '@/hooks/swr'
import toast from 'react-hot-toast'
import { IconSend } from '@tabler/icons-react'
import { Avatar } from '@/components/ui/avatar'

const StartChat = () => {
  const { t } = useTranslation('common')
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
      <div className="max-h-full overflow-x-hidden flex items-center">
        <div className="mx-auto flex flex-col gap-3 px-3 pt-12 align-center">
          <h1 className="text-center">{t('new-chat-title')}</h1>
          <div className="flex flex-col items-center">
            <Avatar
              url={assistant?.icon || undefined}
              fallback={assistant?.name ?? ''}
              size="big"
            ></Avatar>
          </div>
          <h3 className="text-center">{assistant?.name}</h3>
        </div>
      </div>

      <div className="flex flex-col m-auto items-center p-8 border border-primary_color w-[400px] max-w-[80%]">
        <IconSend size="18"></IconSend>
        <h2>Start from here</h2>
        <div className="text-center">{assistant.description}</div>
      </div>

      <ChatInput onSend={startChat} />
    </div>
  )
}

export default StartChat

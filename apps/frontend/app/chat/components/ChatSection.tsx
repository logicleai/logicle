'use client'
import { useContext, useEffect, useRef, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { ChatInputOrApiKey } from '@/app/chat/components/ChatInputOrApiKey'
import { createConversation } from '@/services/conversation'
import { redirect } from 'next/navigation'
import { mutate } from 'swr'
import { useSWRJson } from '@/hooks/swr'
import toast from 'react-hot-toast'
import { StartChatFromHere } from './StartChatFromHere'
import * as dto from '@/types/dto'
import { useEnvironment } from '../../context/environmentProvider'
import { useTranslation } from 'react-i18next'
import { useChatInput } from '@/components/providers/localstoragechatstate'
import { useTokenRateLimit } from '@/components/providers/tokenRateLimitContext'
import { TokenRateLimitBanner } from './TokenRateLimitBanner'
import { Chat } from './Chat'
import { ChatHeader } from './ChatHeader'
import env from '@/lib/env'

// /chat and /chat/[chatId] both render this single component (see page.tsx
// in each of those two directories) instead of each owning their own tree.
// Switching between "compose" and "existing chat" is driven entirely by
// ChatPageContext's urlChatId (see ChatPageContextProvider.navigateToChat),
// never by Next's router — so it's a plain re-render, not a page navigation,
// and the persistent chat shell (sidebar, header) never unmounts. See
// navigateToChat's own comment for why Next's router can't do this itself
// for a runtime-only dynamic segment under output:'export'.
export const ChatSection = () => {
  const { urlChatId } = useContext(ChatPageContext)
  return urlChatId ? <ExistingChat chatId={urlChatId} /> : <StartChat />
}

const deriveChatTitle = (msg: string) => {
  return msg.length > 30 ? `${msg.substring(0, 30)}...` : msg
}

const StartChat = () => {
  const env = useEnvironment()
  const {
    state: { selectedConversation, newChatAssistantId },
    sendMessage,
    setSelectedConversation,
    navigateToChat,
  } = useContext(ChatPageContext)

  const [chatInput, setChatInput] = useChatInput('new-chat')

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // In order to start the chat faster, and avoid race conditions, we set the
  // selectedConversation state before switching to the new chat's view via
  // navigateToChat, but... we must also disable the logic which resets the
  // selectedConversation when the component is first rendered

  // this will be set to true after navigating to the new chat
  const [started, setStarted] = useState<boolean>(false)

  // this code will reset the selectedConversation if one is loaded
  useEffect(() => {
    if (!started && selectedConversation) {
      setSelectedConversation(undefined)
    }
  }, [started, selectedConversation, setSelectedConversation])

  useEffect(() => {})

  const { t } = useTranslation()
  const tokenRateLimit = useTokenRateLimit()

  const assistantId = newChatAssistantId

  if (!assistantId) {
    // A genuinely different, statically-known route (no dynamic segment),
    // so Next's static export has a real prefetch payload for it — this one
    // is fine to leave as a real Next navigation.
    redirect('/chat/assistants/select')
  }

  const swrAssistant = useSWRJson<dto.UserAssistantWithSupportedMedia>(
    `/api/me/assistants/${assistantId}`
  )

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
    })
    if (result.error) {
      toast.error('Failed creating conversation')
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
    navigateToChat(conversation.id)
    // We need to invoke handleSend with the newly created conversation
    // because context won't be propagated immediately.
    sendMessage?.({
      msg: { role: 'user', content, attachments },
      conversation: conversationWithMessages,
    })
  }

  if (!swrAssistant.data) {
    return null
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
      <ChatInputOrApiKey
        // Force remount when assistant changes so input/upload local state resets to the selected assistant.
        key={assistantId}
        assistant={assistant}
        textAreaRef={textareaRef}
        onSend={startChat}
        chatInput={chatInput}
        setChatInput={setChatInput}
        supportedMedia={assistant.supportedMedia}
        modelId={assistant.model}
        tokenLimit={assistant.tokenLimit}
        autoFocus
      />
      {tokenRateLimit?.enabled && tokenRateLimit.exceeded && <TokenRateLimitBanner />}
    </div>
  )
}

const ExistingChat = ({ chatId }: { chatId: string }) => {
  const {
    state: { selectedConversation },
    loadConversation,
  } = useContext(ChatPageContext)

  useEffect(() => {
    if (selectedConversation?.id !== chatId) {
      void loadConversation(chatId).catch(() => {
        toast.error('Failed loading the chat')
      })
    }
  }, [chatId, loadConversation, selectedConversation?.id])

  useEffect(() => {
    document.title = `${selectedConversation?.name ?? env.appDisplayName}`
  }, [selectedConversation?.name])

  const assistantId = selectedConversation?.assistantId
  const { data: assistant } = useSWRJson<dto.UserAssistantWithSupportedMedia>(
    `/api/me/assistants/${assistantId}`
  )

  if (selectedConversation?.id !== chatId || !assistant) {
    return null
  }
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ChatHeader assistant={assistant} />
      <Chat assistant={assistant} className="flex-1" supportedMedia={assistant.supportedMedia} />
    </div>
  )
}

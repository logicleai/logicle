'use client'
import { useParams, useRouter } from 'next/navigation'
import React, { useContext, useRef, useState } from 'react'
import * as dto from '@/types/dto'
import { useSWRJson } from '@/hooks/swr'
import { ScrollArea } from '@/components/ui/scroll-area'
import { groupMessages } from '@/lib/chat/conversationUtils'
import ChatPageContext, { ChatPageContextProps } from '@/app/chat/components/context'
import { defaultChatPageState } from '@/app/chat/components/state'
import { post } from '@/lib/fetch'
import { useTranslation } from 'react-i18next'
import { ChatInput } from '@/app/chat/components/ChatInput'
import toast from 'react-hot-toast'
import { MessageGroup } from '@/app/chat/components/MessageGroup'

const SharePage = () => {
  const { shareId } = useParams() as { shareId: string }
  const { data: sharedConversation } = useSWRJson<dto.SharedConversation>(`/api/share/${shareId}`)
  const router = useRouter()
  const messages = sharedConversation?.messages ?? []
  const groupList = groupMessages(messages)
  const [chatInput, setChatInput] = useState<string>('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const { sendMessage } = useContext(ChatPageContext)

  const chatPageContext: ChatPageContextProps = {
    state: defaultChatPageState,
    setSelectedConversation: () => {},
    setNewChatAssistantId: () => {},
    setChatInputElement: () => {},
  }
  if (!sharedConversation) {
    return <></>
  }
  const handleSend = async ({
    content,
    attachments,
  }: {
    content: string
    attachments: dto.Attachment[]
  }) => {
    const response = await post<dto.ConversationWithMessages>(`/api/share/${shareId}/clone`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    sendMessage?.({
      msg: {
        role: 'user',
        content,
        attachments,
      },
      conversation: {
        ...response.data.conversation,
        messages: response.data.messages,
      },
    })
    router.push(`/chat/${response.data.conversation.id}`)
  }
  return (
    <ChatPageContext.Provider value={chatPageContext}>
      <div className="flex h-full flex-col">
        <div className="group flex flex-row justify-center px-2 gap-3 h-16 items-center">
          <h3 className="flex-1 text-center">{sharedConversation.title}</h3>
        </div>
        <ScrollArea className="flex h-full scroll-workaround">
          <div className="max-w-[var(--thread-content-max-width)] mx-auto">
            {groupList.map((group, index) => (
              <MessageGroup
                key={index}
                assistant={sharedConversation.assistant}
                group={group}
                isLast={index + 1 == groupList.length}
              />
            ))}
          </div>
        </ScrollArea>
        <ChatInput
          chatInput={chatInput}
          setChatInput={setChatInput}
          textAreaRef={textareaRef}
          supportedMedia={['*/*']}
          onSend={handleSend}
        />
      </div>
    </ChatPageContext.Provider>
  )
}

export default SharePage

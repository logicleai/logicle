'use client'
import { useParams } from 'next/navigation'
import React from 'react'
import * as dto from '@/types/dto'
import { useSWRJson } from '@/hooks/swr'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from '@/app/chat/components/ChatMessage'
import { groupMessages } from '@/lib/chat/conversationUtils'
import ChatPageContext, { ChatPageContextProps } from '@/app/chat/components/context'
import { defaultChatPageState } from '@/app/chat/components/state'

const SharePage = () => {
  const { shareId } = useParams() as { shareId: string }
  const { data: sharedConversation } = useSWRJson<dto.SharedConversation>(`/api/share/${shareId}`)
  const messages = sharedConversation?.messages ?? []
  const groupList = groupMessages(messages)

  const chatPageContext: ChatPageContextProps = {
    state: defaultChatPageState,
    setSelectedConversation: () => {},
    setNewChatAssistantId: () => {},
    sendMessage: () => {},
    setChatInputElement: () => {},
  }

  if (!sharedConversation) {
    return <></>
  }
  return (
    <ChatPageContext.Provider value={chatPageContext}>
      <ScrollArea className="flex h-full scroll-workaround">
        <div className="max-w-[var(--thread-content-max-width)] mx-auto">
          {groupList.map((group, index) => (
            <ChatMessage
              key={index}
              assistant={sharedConversation.assistant}
              group={group}
              isLast={index + 1 == groupList.length}
            />
          ))}
        </div>
      </ScrollArea>
    </ChatPageContext.Provider>
  )
}

export default SharePage

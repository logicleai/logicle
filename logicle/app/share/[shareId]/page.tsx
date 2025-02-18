'use client'
import { useParams } from 'next/navigation'
import React from 'react'
import { useTranslation } from 'react-i18next'
import * as dto from '@/types/dto'
import { useSWRJson } from '@/hooks/swr'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from '@/app/chat/components/ChatMessage'
import { groupMessages } from '@/lib/chat/conversationUtils'
import ChatPageContext, { ChatPageContextProps } from '@/app/chat/components/context'
import { defaultChatPageState } from '@/app/chat/components/state'

const SharePage = () => {
  const { shareId } = useParams() as { shareId: string }
  const { t } = useTranslation()
  const { data: messages_ } = useSWRJson<dto.Message[]>(`/api/share/${shareId}/messages`)
  const messages = messages_ ?? []
  const groupList = groupMessages(messages)

  const chatPageContext = {
    state: defaultChatPageState,
    setSelectedConversation: () => {},
    setNewChatAssistantId: () => {},
  } as unknown as ChatPageContextProps

  return (
    <ChatPageContext.Provider value={chatPageContext}>
      <ScrollArea className="flex h-full scroll-workaround">
        <div className="max-w-[700px] mx-auto">
          {groupList.map((group, index) => (
            <ChatMessage
              key={index}
              assistant={{ id: 'kkk', name: 'kkk' } as dto.UserAssistant}
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
function setNewChatAssistantId(assistantId: string | null): void {
  throw new Error('Function not implemented.')
}

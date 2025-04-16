'use client'
import React, { useContext } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import { useParams, useRouter } from 'next/navigation'
import { useSWRJson } from '@/hooks/swr'
import * as dto from '@/types/dto'
import WithLoadingAndError from '@/components/ui/WithLoadingAndError'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

const ChatFolderPage = () => {
  const { t } = useTranslation()
  const { folderId } = useParams() as { folderId: string }
  const router = useRouter()

  const { data: folder } = useSWRJson<dto.ConversationFolder>(`/api/user/folders/${folderId}`)

  const {
    data: conversations,
    isLoading,
    error,
  } = useSWRJson<dto.Conversation[]>(`/api/user/folders/${folderId}/conversations`)

  const handleClick = (conversation: dto.Conversation) => {
    router.push(`/chat/${conversation.id}`)
  }
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="flex flex-1 flex-col gap-2 items-center px-4 py-6">
        <div className="max-w-[960px] w-3/4 h-full flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="mb-4">{`${t('folder')} ${folder?.name ?? ''}`}</h1>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className=" gap-4 flex flex-col">
              {(conversations ?? []).map((conversation) => {
                return (
                  <Button
                    variant="ghost"
                    key={conversation.id}
                    className="flex group align-center gap-2 items-center"
                    onClick={() => handleClick(conversation)}
                  >
                    <div className="flex flex-col flex-1 h-full text-left">
                      <div className="font-bold">{conversation.name}</div>
                    </div>
                  </Button>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </div>
    </WithLoadingAndError>
  )
}

export default ChatFolderPage

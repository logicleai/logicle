'use client'
import { useContext } from 'react'
import { useSWRJson } from '@/hooks/swr'
import * as dto from '@/types/dto'
import WithLoadingAndError from '@/components/ui/WithLoadingAndError'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTranslation } from 'react-i18next'
import { useUrlSegment } from '@/hooks/useUrlSegment'
import ChatPageContext from '@/app/chat/components/context'

const ChatFolderPage = () => {
  const { t } = useTranslation()
  const folderId = useUrlSegment(2)
  const { navigateToChat } = useContext(ChatPageContext)

  const { data: folder } = useSWRJson<dto.ConversationFolder>(`/api/me/folders/${folderId}`)

  const {
    data: conversations,
    isLoading,
    error,
  } = useSWRJson<dto.Conversation[]>(`/api/me/folders/${folderId}/conversations`)

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
                  <a
                    href={`/chat/${conversation.id}`}
                    key={conversation.id}
                    className="flex group align-center gap-2 items-center"
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                        return
                      }
                      e.preventDefault()
                      navigateToChat(conversation.id)
                    }}
                  >
                    <div className="flex flex-col flex-1 h-full text-left">
                      <div className="font-bold">{conversation.name}</div>
                    </div>
                  </a>
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

'use client'
import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ChatPageContext from '@/app/chat/components/context'
import { useRouter } from 'next/navigation'
import {
  IconArrowLeft,
  IconLayoutSidebarLeftCollapse,
  IconMistOff,
  IconPlus,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { useSWRJson } from '@/hooks/swr'
import { ConversationComponent } from './Conversation'
import { ScrollArea } from '@/components/ui/scroll-area'
import dayjs from 'dayjs'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { mutate } from 'swr'
import * as dto from '@/types/dto'
import { AssistantAvatar } from '@/components/app/Avatars'
import { CreateFolderDialog } from './CreateFolderDialog'
import { ChatFolder } from './ChatFolder'
import { useEnvironment } from '@/app/context/environmentProvider'
import { isSharedWithAllOrAnyWorkspace } from '@/types/dto'
import { useLayoutConfig } from '@/components/providers/layoutconfigContext'

export const Chatbar = () => {
  const { t } = useTranslation()
  const layoutconfigContext = useLayoutConfig()

  const router = useRouter()

  const {
    state: chatState,
    setNewChatAssistantId,
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const [creatingFolder, setCreatingFolder] = useState<boolean>(false)
  const environment = useEnvironment()
  const userProfile = useUserProfile()

  const userWorkspaceIds = userProfile?.workspaces?.map((w) => w.id) ?? []
  const pinnedAssistants = (userProfile?.pinnedAssistants ?? []).filter((assistant) => {
    // Why am I filtering here? I don't quite remember, but possibly I wanted to
    // avoid that if an assistant was un-shared, users who had pinned it would not see it
    return (
      assistant.owner == userProfile?.id ||
      isSharedWithAllOrAnyWorkspace(assistant.sharing, userWorkspaceIds)
    )
  })

  let { data: conversations } = useSWRJson<dto.ConversationWithFolder[]>(`/api/conversations`)
  const { data: folders } = useSWRJson<dto.ConversationFolder[]>(`/api/user/folders`)
  conversations = (conversations ?? [])
    .slice()
    .sort((a, b) => ((a.lastMsgSentAt ?? a.createdAt) < (b.lastMsgSentAt ?? b.createdAt) ? 1 : -1))

  useEffect(() => {
    const selectedConversation = chatState.selectedConversation
    if (!selectedConversation || !conversations) {
      return
    }
    const matchingConversation = conversations.find((c) => c.id == selectedConversation.id)
    if (!matchingConversation) {
      return
    }
    if (selectedConversation.messages.length) {
      const lastMsgSentAt = selectedConversation.messages
        .map((a) => a.sentAt)
        .reduce((a, b) => (a > b ? a : b), '')
      if (lastMsgSentAt != matchingConversation.lastMsgSentAt) {
        const patchedConversations = conversations.map((c) => {
          if (c.id == selectedConversation.id) {
            return {
              ...c,
              lastMsgSentAt,
            }
          } else {
            return c
          }
        })
        void mutate('/api/conversations', patchedConversations, {
          revalidate: false,
        })
      }
    }
  }, [chatState.selectedConversation, conversations])

  const handleNewConversation = () => {
    setSelectedConversation(undefined)
    router.push('/chat/assistants/select')
  }

  const handleNewConversationWithAssistant = (assistantId: string) => {
    setNewChatAssistantId(assistantId)
    router.push('/chat')
  }

  // Here it's the right place to group by folder, if we want to use folders
  const groupConversations = (conversations: dto.ConversationWithFolder[]) => {
    const todayLimit = dayjs().startOf('day').toISOString()
    const yesterdayLimit = dayjs().startOf('day').subtract(1, 'days').toISOString()
    const currentWeekLimit = dayjs().startOf('week').toISOString()
    const conversationsToday: dto.ConversationWithFolder[] = []
    const conversationsYesterday: dto.ConversationWithFolder[] = []
    const conversationsCurrentWeek: dto.ConversationWithFolder[] = []
    const conversationsOlder: dto.ConversationWithFolder[] = []
    for (const conversation of conversations) {
      const lastMsgSentAt = conversation.lastMsgSentAt ?? conversation.createdAt
      if (lastMsgSentAt > todayLimit) {
        conversationsToday.push(conversation)
      } else if (lastMsgSentAt > yesterdayLimit) {
        conversationsYesterday.push(conversation)
      } else if (lastMsgSentAt > currentWeekLimit) {
        conversationsCurrentWeek.push(conversation)
      } else {
        conversationsOlder.push(conversation)
      }
    }
    return {
      conversationsToday,
      conversationsYesterday,
      conversationsCurrentWeek,
      conversationsOlder,
    }
  }
  const groupedConversation = groupConversations(conversations)

  const giveFocusToChatInput = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isPrintable = e.key.length === 1 // Printable single-character keys have length === 1
    if (isPrintable) {
      chatState.chatInputElement?.focus()
    }
  }

  return (
    <div
      className={`z-40 flex flex-1 flex-col space-y-2 p-2 text-[14px] transition-all overflow-hidden relative`}
    >
      <div className="flex items-center justify-between" onKeyDown={giveFocusToChatInput}>
        <div>
          <Button
            variant="outline"
            size="body1"
            className="flex flex-1 justify-between py-1 px-1 gap-2"
            onClick={() => {
              handleNewConversation()
            }}
          >
            <IconPlus size={16} />
            <span>{t('new-chat')}</span>
          </Button>
        </div>
        <button
          className="absolute right-0"
          onClick={() => layoutconfigContext.setShowSidebar(false)}
        >
          <IconLayoutSidebarLeftCollapse size={28}></IconLayoutSidebarLeftCollapse>
        </button>
      </div>

      {pinnedAssistants.length != 0 && (
        <>
          <div className="flex flex-col items-start border-b" onKeyDown={giveFocusToChatInput}>
            {pinnedAssistants.map((assistant) => {
              return (
                <Button
                  className="w-full p-2"
                  variant="ghost"
                  size="link"
                  key={assistant.id}
                  onClick={() => handleNewConversationWithAssistant(assistant.id)}
                >
                  <AssistantAvatar className="shrink-0" assistant={assistant} />
                  <div
                    key={assistant.id}
                    className="flex-1 min-w-0 text-left overflow-hidden text-ellipsis px-2"
                  >
                    {assistant.name}
                  </div>
                </Button>
              )
            })}
          </div>
        </>
      )}
      <ScrollArea className="flex-1 scroll-workaround pr-2" onKeyDown={giveFocusToChatInput}>
        {conversations?.length > 0 ? (
          <>
            {environment.enableChatFolders && (
              <div className="flex flex-col">
                <h5 className="text-muted-foreground flex items-center">
                  <span className="flex-1">{t('folders')}</span>
                  <Button variant="ghost" onClick={() => setCreatingFolder(true)}>
                    <IconPlus />
                  </Button>
                </h5>
                {(folders ?? []).map((f) => {
                  return <ChatFolder key={f.id} folder={f}></ChatFolder>
                })}
              </div>
            )}

            {groupedConversation.conversationsToday.length > 0 && (
              <div>
                <h5 className="text-muted-foreground">{t('today')}</h5>
                {groupedConversation.conversationsToday.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsYesterday.length > 0 && (
              <div>
                <h5 className="text-muted-foreground">{t('yesterday')}</h5>
                {groupedConversation.conversationsYesterday.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsCurrentWeek.length > 0 && (
              <div>
                <h5 className="text-muted-foreground">{t('previous-week')}</h5>
                {groupedConversation.conversationsCurrentWeek.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsOlder.length > 0 && (
              <div>
                <h5 className="text-muted-foreground">{t('older')}</h5>
                {groupedConversation.conversationsOlder.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mt-8 select-none text-center opacity-50">
            <IconMistOff className="mx-auto mb-3" />
            <span className="text-[14px] leading-normal">{t('No data.')}</span>
          </div>
        )}
      </ScrollArea>
      {creatingFolder && (
        <CreateFolderDialog onClose={() => setCreatingFolder(false)}></CreateFolderDialog>
      )}
    </div>
  )
}

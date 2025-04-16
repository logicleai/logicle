import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ChatPageContext from '@/app/chat/components/context'
import { useRouter } from 'next/navigation'
import { IconMistOff, IconPlus } from '@tabler/icons-react'
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

export const Chatbar = () => {
  const { t } = useTranslation()

  const router = useRouter()

  const {
    state: chatState,
    setNewChatAssistantId,
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const [creatingFolder, setCreatingFolder] = useState<boolean>(false)
  const environment = useEnvironment()
  const userProfile = useUserProfile()

  const isWorkspaceVisible = (workspaceId: string) => {
    return userProfile?.workspaces?.find((w) => w.id == workspaceId)
  }

  const pinnedAssistants = (userProfile?.pinnedAssistants ?? []).filter((assistant) => {
    return (
      assistant.owner == userProfile?.id ||
      assistant.sharing.find(
        (s) => s.type == 'all' || (s.type == 'workspace' && isWorkspaceVisible(s.workspaceId))
      )
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
  return (
    <div
      className={`z-40 flex flex-1 flex-col space-y-2 p-2 text-[14px] transition-all overflow-hidden`}
    >
      <div className="flex items-center">
        <Button
          variant="outline"
          className="flex flex-1 justify-between"
          onClick={() => {
            handleNewConversation()
          }}
        >
          <h2>{t('new-chat')}</h2>
          <IconPlus size={16} />
        </Button>
      </div>

      {pinnedAssistants.length != 0 && (
        <>
          <div className="flex flex-col items-start">
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
      <ScrollArea className="flex-1 scroll-workaround pr-2">
        {conversations?.length > 0 ? (
          <>
            {environment.enableChatFolders && (
              <div className="flex flex-col">
                <h5 className="text-secondary_text_color flex items-center">
                  <span className="flex-1">{t('folders')}</span>
                  <Button variant="ghost" onClick={() => setCreatingFolder(true)}>
                    <IconPlus />
                  </Button>
                </h5>
                {(folders ?? []).map((f) => {
                  return <ChatFolder folder={f}></ChatFolder>
                })}
              </div>
            )}

            {groupedConversation.conversationsToday.length > 0 && (
              <div>
                <h5 className="text-secondary_text_color">{t('today')}</h5>
                {groupedConversation.conversationsToday.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsYesterday.length > 0 && (
              <div>
                <h5 className="text-secondary_text_color">{t('yesterday')}</h5>
                {groupedConversation.conversationsYesterday.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsCurrentWeek.length > 0 && (
              <div>
                <h5 className="text-secondary_text_color">{t('previous-week')}</h5>
                {groupedConversation.conversationsCurrentWeek.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsOlder.length > 0 && (
              <div>
                <h5 className="text-secondary_text_color">{t('older')}</h5>
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

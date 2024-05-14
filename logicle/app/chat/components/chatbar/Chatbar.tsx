import { useContext, useEffect } from 'react'
import { useTranslation } from 'next-i18next'
import ChatPageContext from '@/app/chat/components/context'
import { useRouter } from 'next/navigation'
import { IconMistOff, IconPlus } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { ConversationWithFolder } from '@/types/chat'
import { useSWRJson } from '@/hooks/swr'
import { ConversationComponent } from './Conversation'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import dayjs from 'dayjs'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { mutate } from 'swr'

export const Chatbar = () => {
  const { t } = useTranslation('sidebar')

  const router = useRouter()

  const { state: chatState, dispatch: homeDispatch } = useContext(ChatPageContext)

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

  let { data: conversations } = useSWRJson<ConversationWithFolder[]>(`/api/conversations`)
  conversations = (conversations ?? []).toSorted((a, b) =>
    (a.lastMsgSentAt ?? a.createdAt) < (b.lastMsgSentAt ?? b.createdAt) ? 1 : -1
  )

  useEffect(() => {
    const selectedConversation = chatState.selectedConversation
    if (!selectedConversation || !conversations) {
      return
    }
    const matchingConversation = conversations.find((c) => c.id == selectedConversation.id)
    if (!matchingConversation) {
      return
    }
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
      mutate('/api/conversations', patchedConversations, {
        revalidate: false,
      })
    }
  }, [chatState.selectedConversation, conversations])

  const handleNewConversation = () => {
    homeDispatch({ field: 'selectedConversation', value: undefined })
    router.push('/chat/select_assistant')
  }

  const handleNewConversationWithAssistant = (assistantId: string) => {
    homeDispatch({ field: 'newChatAssistantId', value: assistantId })
    router.push('/chat')
  }

  // Here it's the right place to group by folder, if we want to use folders
  const groupConversations = (conversations: ConversationWithFolder[]) => {
    const todayLimit = dayjs().startOf('day').toISOString()
    const weekLimit = dayjs().startOf('week').toISOString()
    const today: ConversationWithFolder[] = []
    const week: ConversationWithFolder[] = []
    const older: ConversationWithFolder[] = []
    for (const conversation of conversations) {
      const lastMsgSentAt = conversation.lastMsgSentAt ?? conversation.createdAt
      if (lastMsgSentAt < weekLimit) {
        older.push(conversation)
      } else if (lastMsgSentAt < todayLimit) {
        week.push(conversation)
      } else {
        today.push(conversation)
      }
    }
    return {
      today,
      week,
      older,
    }
  }
  const groupedConversation = groupConversations(conversations)
  return (
    <div
      className={`z-40 flex flex-1 flex-col space-y-2 p-2 text-[14px] transition-all overflow-hidden`}
    >
      <div className="flex items-center pb-4">
        <Button
          variant="outline"
          className="flex flex-1 justify-between"
          disabled={chatState.chatStatus.state != 'idle'}
          onClick={() => {
            handleNewConversation()
          }}
        >
          <h2>{t('New chat')}</h2>
          <IconPlus size={16} />
        </Button>
      </div>

      {pinnedAssistants.length != 0 && (
        <>
          <h5 className="text-secondary_text_color">PINS</h5>
          <div className="flex flex-col items-start">
            {pinnedAssistants.map((assistant) => {
              return (
                <Button
                  className="w-full p-2"
                  variant="ghost"
                  size="link"
                  key={assistant.id}
                  disabled={chatState.chatStatus.state != 'idle'}
                  onClick={() => handleNewConversationWithAssistant(assistant.id)}
                >
                  <Avatar
                    className="shrink-0"
                    url={assistant?.icon ?? undefined}
                    fallback={assistant.name ?? ''}
                  />
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
            {groupedConversation.today.length > 0 && (
              <div>
                <h5 className="text-secondary_text_color">{t('today')}</h5>
                {groupedConversation.today.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.week.length > 0 && (
              <div>
                <h5 className="text-secondary_text_color">{t('previous-week')}</h5>
                {groupedConversation.week.map((conversation, index) => (
                  <ConversationComponent key={index} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.older.length > 0 && (
              <div>
                <h5 className="text-secondary_text_color">{t('older')}</h5>
                {groupedConversation.older.map((conversation, index) => (
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
    </div>
  )
}

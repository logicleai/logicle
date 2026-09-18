'use client'
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import ChatPageContext from '@/app/chat/components/context'
import { useRouter } from 'next/navigation'
import { IconEdit, IconMistOff, IconPlus, IconSearch } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { useSWRInfiniteJson, useSWRJson } from '@/hooks/swr'
import { ConversationComponent } from './Conversation'
import { ScrollArea } from '@/components/ui/scroll-area'
import dayjs from 'dayjs'
import { useUserProfile } from '@/components/providers/userProfileContext'
import * as dto from '@/types/dto'
import { AssistantAvatar } from '@/components/app/Avatars'
import { CreateFolderDialog } from './CreateFolderDialog'
import { ChatFolder } from './ChatFolder'
import { useEnvironment } from '@/app/context/environmentProvider'
import { isSharedWithAllOrAnyWorkspace } from '@/types/dto'
import { ConversationSearchDialog } from './ConversationSearchDialog'
import { ErrorMsg, Loading } from '@/components/ui'
import { conversationListKey } from '@/services/conversation'

export const Chatbar = () => {
  const { t } = useTranslation()

  const router = useRouter()

  const {
    state: chatState,
    setNewChatAssistantId,
    setSelectedConversation,
    navigateToChat,
  } = useContext(ChatPageContext)

  const [creatingFolder, setCreatingFolder] = useState<boolean>(false)
  const [showSearch, setShowSearch] = useState<boolean>(false)
  const environment = useEnvironment()
  const userProfile = useUserProfile()

  const userWorkspaceIds = userProfile?.workspaces?.map((w) => w.id) ?? []
  const pinnedAssistants = (userProfile?.pinnedAssistants ?? []).filter((assistant) => {
    // Why am I filtering here? I don't quite remember, but possibly I wanted to
    // avoid that if an assistant was un-shared, users who had pinned it would not see it
    return (
      assistant.owner === userProfile?.id ||
      isSharedWithAllOrAnyWorkspace(assistant.sharing, userWorkspaceIds)
    )
  })

  const {
    data: conversationPages,
    error: conversationsError,
    isLoading: conversationsLoading,
    isValidating: conversationsValidating,
    mutate: mutateConversationPages,
    setSize,
    size,
  } = useSWRInfiniteJson<dto.ConversationPage>(
    (pageIndex, previousPageData) => {
      if (pageIndex === 0) {
        return conversationListKey
      }
      if (!previousPageData?.nextCursor) {
        return null
      }
      return `${conversationListKey}?cursor=${encodeURIComponent(previousPageData.nextCursor)}`
    },
    {
      revalidateFirstPage: false,
    }
  )
  const {
    data: folders,
    error: foldersError,
    isLoading: foldersLoading,
  } = useSWRJson<dto.ConversationFolder[]>(`/api/me/folders`)
  const conversations = useMemo(() => {
    const byId = new Map<string, dto.ConversationWithFolder>()
    for (const page of conversationPages ?? []) {
      for (const conversation of page.conversations) {
        byId.set(conversation.id, conversation)
      }
    }
    return [...byId.values()].sort((a, b) => {
      const aDate = a.lastMsgSentAt ?? a.createdAt
      const bDate = b.lastMsgSentAt ?? b.createdAt
      if (aDate === bDate) return b.id.localeCompare(a.id)
      return aDate < bDate ? 1 : -1
    })
  }, [conversationPages])

  const conversationViewportRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const requestedConversationSizeRef = useRef(0)
  const hasMoreConversations = conversationPages
    ? conversationPages.at(-1)?.nextCursor !== null
    : false
  const isLoadingMore =
    conversationsValidating &&
    conversationPages !== undefined &&
    conversationPages[size - 1] === undefined

  const loadMoreConversations = useCallback(() => {
    const nextSize = size + 1
    if (
      !hasMoreConversations ||
      isLoadingMore ||
      requestedConversationSizeRef.current >= nextSize
    ) {
      return
    }
    requestedConversationSizeRef.current = nextSize
    void setSize(nextSize).catch(() => {
      requestedConversationSizeRef.current = size
    })
  }, [hasMoreConversations, isLoadingMore, setSize, size])

  const handleConversationScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const viewport = event.currentTarget
      scrollTopRef.current = viewport.scrollTop
      if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 240) {
        loadMoreConversations()
      }
    },
    [loadMoreConversations]
  )

  useLayoutEffect(() => {
    if (conversationViewportRef.current) {
      conversationViewportRef.current.scrollTop = scrollTopRef.current
    }
  }, [conversationPages])

  useEffect(() => {
    const viewport = conversationViewportRef.current
    if (viewport && viewport.scrollHeight <= viewport.clientHeight && hasMoreConversations) {
      loadMoreConversations()
    }
  }, [conversations.length, hasMoreConversations, loadMoreConversations])

  useEffect(() => {
    const selectedConversation = chatState.selectedConversation
    if (!selectedConversation) {
      return
    }
    const matchingConversation = conversations.find((c) => c.id === selectedConversation.id)
    if (!matchingConversation) {
      return
    }
    if (selectedConversation.messages.length) {
      const lastMsgSentAt = selectedConversation.messages
        .map((a) => a.sentAt)
        .reduce((a, b) => (a > b ? a : b), '')
      if (lastMsgSentAt !== matchingConversation.lastMsgSentAt) {
        void mutateConversationPages(
          (currentPages) =>
            currentPages?.map((page) => ({
              ...page,
              conversations: page.conversations.map((conversation) =>
                conversation.id === selectedConversation.id
                  ? { ...conversation, lastMsgSentAt }
                  : conversation
              ),
            })),
          { revalidate: false }
        )
      }
    }
  }, [chatState.selectedConversation, conversations, mutateConversationPages])

  const handleNewConversation = () => {
    setSelectedConversation(undefined)
    router.push('/chat/assistants/select')
  }

  const handleSearchConversation = () => {
    setShowSearch(true)
  }

  const handleNewConversationWithAssistant = (assistantId: string) => {
    setNewChatAssistantId(assistantId)
    navigateToChat(undefined)
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
      className={`z-40 flex min-h-0 flex-1 flex-col gap-3 p-3 text-[14px] transition-all overflow-hidden relative`}
    >
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="body1"
          style={{ justifyContent: 'start' }}
          className="flex flex-1 justify-start gap-2 px-2"
          onClick={() => {
            handleNewConversation()
          }}
        >
          <IconEdit size={16} />
          <span>{t('new-chat')}</span>
        </Button>
        <Button
          variant="ghost"
          size="body1"
          style={{ justifyContent: 'start' }}
          className="flex flex-1 justify-start gap-2 px-2 text-muted-foreground"
          onClick={() => {
            handleSearchConversation()
          }}
        >
          <IconSearch size={16} />
          <span>{t('search-chats')}</span>
        </Button>
      </div>

      {pinnedAssistants.length !== 0 && (
        <div className="flex flex-col items-start border-b pb-3">
          {pinnedAssistants.map((assistant) => {
            return (
              <Button
                className="w-full justify-start gap-2 px-2"
                variant="ghost"
                size="link"
                key={assistant.id}
                onClick={() => handleNewConversationWithAssistant(assistant.id)}
              >
                <AssistantAvatar className="shrink-0" assistant={assistant} />
                <div
                  key={assistant.id}
                  className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis"
                >
                  {assistant.name}
                </div>
              </Button>
            )
          })}
        </div>
      )}
      <ScrollArea
        ref={conversationViewportRef}
        onScroll={handleConversationScroll}
        data-testid="conversation-scroll-area"
        className="min-h-0 flex-1 scroll-workaround pr-2"
      >
        {conversationsLoading ? (
          <div className="mt-8 flex justify-center">
            <Loading />
          </div>
        ) : conversationsError && !conversationPages ? (
          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <ErrorMsg>{t('generic-error')}</ErrorMsg>
            <Button variant="secondary" onClick={() => void mutateConversationPages()}>
              {t('retry')}
            </Button>
          </div>
        ) : conversations.length > 0 ? (
          <>
            {environment.enableChatFolders && (
              <div className="flex flex-col">
                <h5 className="mb-1 flex items-center px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  <span className="flex-1">{t('folders')}</span>
                  <Button variant="ghost" onClick={() => setCreatingFolder(true)}>
                    <IconPlus />
                  </Button>
                </h5>
                {foldersLoading && <Loading />}
                {foldersError && <ErrorMsg>{t('generic-error')}</ErrorMsg>}
                {(folders ?? []).map((f) => {
                  return <ChatFolder key={f.id} folder={f}></ChatFolder>
                })}
              </div>
            )}

            {groupedConversation.conversationsToday.length > 0 && (
              <div>
                <h5 className="mb-1 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {t('today')}
                </h5>
                {groupedConversation.conversationsToday.map((conversation) => (
                  <ConversationComponent key={conversation.id} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsYesterday.length > 0 && (
              <div>
                <h5 className="mb-1 mt-4 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {t('yesterday')}
                </h5>
                {groupedConversation.conversationsYesterday.map((conversation) => (
                  <ConversationComponent key={conversation.id} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsCurrentWeek.length > 0 && (
              <div>
                <h5 className="mb-1 mt-4 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {t('previous-week')}
                </h5>
                {groupedConversation.conversationsCurrentWeek.map((conversation) => (
                  <ConversationComponent key={conversation.id} conversation={conversation} />
                ))}
              </div>
            )}
            {groupedConversation.conversationsOlder.length > 0 && (
              <div>
                <h5 className="mb-1 mt-4 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {t('older')}
                </h5>
                {groupedConversation.conversationsOlder.map((conversation) => (
                  <ConversationComponent key={conversation.id} conversation={conversation} />
                ))}
              </div>
            )}
            {hasMoreConversations && (
              <div
                className="flex flex-col items-center gap-2 py-3"
                data-testid="conversation-load-more"
              >
                {conversationsError ? (
                  <>
                    <ErrorMsg>{t('generic-error')}</ErrorMsg>
                    <Button variant="secondary" onClick={() => void setSize(size)}>
                      {t('retry')}
                    </Button>
                  </>
                ) : isLoadingMore ? (
                  <Loading />
                ) : (
                  <Button variant="ghost" onClick={loadMoreConversations}>
                    {t('load-more-conversations')}
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="mt-8 select-none text-center opacity-50">
            <IconMistOff className="mx-auto mb-3" />
            <span className="text-[14px] leading-normal">{t('no-data')}</span>
          </div>
        )}
      </ScrollArea>
      {creatingFolder && (
        <CreateFolderDialog onClose={() => setCreatingFolder(false)}></CreateFolderDialog>
      )}
      {showSearch && (
        <ConversationSearchDialog onClose={() => setShowSearch(false)}></ConversationSearchDialog>
      )}
    </div>
  )
}

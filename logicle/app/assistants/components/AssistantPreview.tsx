import * as dto from '@/types/dto'
import { Chat } from '@/app/chat/components/Chat'
import ChatPageContext, {
  ChatPageContextProps,
  SendMessageParams,
  SideBarContent,
} from '@/app/chat/components/context'
import { defaultChatPageState } from '@/app/chat/components/state'
import { nanoid } from 'nanoid'
import { useMemo, useRef, useState } from 'react'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import { Button } from '@/components/ui/button'
import { IconRotate } from '@tabler/icons-react'
import { fetchChatResponse } from '@/services/chat'
import { StartChatFromHere } from '@/app/chat/components/StartChatFromHere'
import { ChatInputOrApiKey } from '@/app/chat/components/ChatInputOrApiKey'
import { useTranslation } from 'react-i18next'
import { flatten } from '@/lib/chat/conversationUtils'
import { ConversationWithMessages } from '@/lib/chat/types'
import { useBackends } from '@/hooks/backends'
import { useUserSecretStatuses } from '@/hooks/userSecrets'
import { isUserProvidedApiKey } from '@/lib/userSecrets/constants'
import { ChatDisclaimer } from '@/app/chat/components/ChatDisclaimer'

interface Props {
  assistant: dto.AssistantDraft
  className?: string
  sendDisabled?: boolean
}

export const AssistantPreview = ({ assistant, className, sendDisabled }: Props) => {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const { data: backends } = useBackends()
  const { data: secretStatuses } = useUserSecretStatuses()
  const requiresUserKey = useMemo(() => {
    const backend = backends?.find((item) => item.id === assistant.backendId)
    if (!backend) return false
    return 'apiKey' in backend && isUserProvidedApiKey(backend.apiKey)
  }, [assistant.backendId, backends])
  const hasReadableKey = useMemo(() => {
    return !!secretStatuses?.some(
      (status) => status.context === assistant.backendId && status.readable
    )
  }, [assistant.backendId, secretStatuses])
  const backendName =
    backends?.find((item) => item.id === assistant.backendId)?.name ?? assistant.backendId
  const usability =
    requiresUserKey && !hasReadableKey
      ? {
          state: 'need-api-key' as const,
          backendId: assistant.backendId,
          backendName: backendName,
        }
      : { state: 'usable' as const }
  const userAssistant = {
    ...assistant,
    lastUsed: '',
    pinned: false,
    sharing: [],
    owner: '',
    ownerName: '',
    cloneable: false,
    versionId: '',
    tools: [],
    pendingChanges: false,
    backendId: assistant.backendId,
    usability,
  }

  const [conversation, setConversation] = useState<ConversationWithMessages>({
    assistantId: '',
    id: '',
    name: '',
    ownerId: '',
    createdAt: '',
    messages: [],
    lastMsgSentAt: null,
  })

  const [chatStatus, setChatStatus] = useState<ChatStatus>({ state: 'idle' })
  const [chatInput, setChatInput] = useState<string>('')
  const [sideBarContent, setSideBarContent] = useState<SideBarContent | undefined>(undefined)

  const clearConversation = () => {
    setConversation({
      ...conversation,
      messages: [],
    })
  }

  const handleSend = async ({ msg, repeating }: SendMessageParams) => {
    const userMsgId = nanoid()
    let parentMsgId: string | null = null
    if (repeating) {
      parentMsgId = repeating.parent
    } else if (conversation.messages.length !== 0) {
      parentMsgId = conversation.messages[conversation.messages.length - 1].id
    }
    const userMessage = {
      ...msg,
      id: userMsgId,
      conversationId: '',
      parent: parentMsgId,
      role: msg.role ?? 'user',
      sentAt: new Date().toISOString(),
      attachments: msg.role === 'user' ? msg.attachments ?? [] : [],
    } as dto.Message

    await fetchChatResponse(
      '/api/assistants/evaluate',
      {},
      JSON.stringify({
        assistant: assistant,
        messages: flatten([...conversation.messages, userMessage]),
      }),
      conversation,
      userMessage,
      setChatStatus,
      setConversation,
      t
    )
  }

  const chatPageContext = {
    state: {
      ...defaultChatPageState,
      chatStatus,
      selectedConversation: conversation,
      chatInputElement: null,
      sideBarContent,
    },
    setSelectedConversation: () => {},
    setNewChatAssistantId: () => {},
    sendMessage: handleSend,
    setChatInputElement: () => {},
    setSideBarContent,
  } as ChatPageContextProps
  return (
    <ChatPageContext.Provider value={chatPageContext}>
      {conversation.messages.length === 0 ? (
        <div className={`flex flex-col overflow-hidden ${className ?? ''}`}>
          <StartChatFromHere
            className="flex-1"
            assistant={userAssistant}
            onPrompt={(prompt) => {
              setChatInput(prompt)
              textareaRef?.current?.focus()
            }}
          ></StartChatFromHere>
          {sendDisabled ? (
            <div className="pt-.5 px-4 text-body1">
              <div className="relative max-w-[var(--thread-content-max-width)] mx-auto w-full flex flex-col rounded-md text-center">
                {t('configure_assistant_before_sending_messages')}
              </div>
            </div>
          ) : (
            <ChatInputOrApiKey
              assistant={userAssistant}
              chatInput={chatInput}
              setChatInput={setChatInput}
              textAreaRef={textareaRef}
              supportedMedia={['*/*']}
              onSend={(msg) => handleSend({ msg: { ...msg, role: 'user' } })}
            />
          )}
          <ChatDisclaimer />
        </div>
      ) : (
        <div className={`flex flex-col overflow-hidden ${className ?? ''}`}>
          <div className="flex items-center m-auto">
            <h3 className="text-center">{t('preview')}</h3>
            <Button
              variant="ghost"
              size="icon"
              className="flex items-center gap-3 group focus:visible"
              onClick={clearConversation}
            >
              <IconRotate
                size="18"
                className={chatStatus.state === 'idle' ? '' : 'invisible'}
              ></IconRotate>
            </Button>
          </div>
          <Chat className={'flex-1'} assistant={userAssistant} supportedMedia={['*/*']}></Chat>
        </div>
      )}
    </ChatPageContext.Provider>
  )
}

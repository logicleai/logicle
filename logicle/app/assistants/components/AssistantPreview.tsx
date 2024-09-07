import * as dto from '@/types/dto'
import { Chat } from '@/app/chat/components/Chat'
import ChatPageContext, {
  ChatPageContextProps,
  SendMessageParams,
} from '@/app/chat/components/context'
import { defaultChatPageState } from '@/app/chat/components/state'
import { nanoid } from 'nanoid'
import { useRef, useState } from 'react'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import { Button } from '@/components/ui/button'
import { IconRotate } from '@tabler/icons-react'
import { appendMessage, fetchChatResponse } from '@/services/chat'
import { StartChatFromHere } from '@/app/chat/components/StartChatFromHere'
import { ChatInput } from '@/app/chat/components/ChatInput'
import { useTranslation } from 'react-i18next'
import { flatten } from '@/lib/chat/conversationUtils'

interface Props {
  assistant: dto.AssistantWithTools
  className?: string
  sendDisabled?: boolean
}

export const AssistantPreview = ({ assistant, className, sendDisabled }: Props) => {
  const { t } = useTranslation('common')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const userAssistant = {
    ...assistant,
    lastUsed: '',
    pinned: false,
    sharing: [],
    owner: '',
  }

  const [conversation, setConversation] = useState<dto.ConversationWithMessages>({
    assistantId: '',
    id: '',
    name: '',
    ownerId: '',
    createdAt: '',
    messages: [],
  })

  const [chatStatus, setChatStatus] = useState<ChatStatus>({ state: 'idle' })
  const [chatInput, setChatInput] = useState<string>('')

  const clearConversation = () => {
    setConversation({
      ...conversation,
      messages: [],
    })
  }

  const handleSend = async ({
    role,
    content,
    attachments,
    repeating,
    confirmResponse,
  }: SendMessageParams) => {
    const userMsgId = nanoid()
    let parentMsgId: string | null = null
    if (repeating) {
      parentMsgId = repeating.parent
    } else if (conversation.messages.length != 0) {
      parentMsgId = conversation.messages[conversation.messages.length - 1].id
    }
    const userMessage: dto.Message = {
      id: userMsgId,
      conversationId: '',
      parent: parentMsgId,
      content,
      role: role ?? 'user',
      sentAt: new Date().toISOString(),
      attachments: attachments ?? [],
      confirmResponse,
    }

    const conversationWithUserMsg = appendMessage(conversation, userMessage)
    setConversation(conversationWithUserMsg)

    await fetchChatResponse(
      '/api/assistants/evaluate',
      JSON.stringify({
        assistant: assistant,
        messages: flatten(conversationWithUserMsg).messages,
      }),
      conversationWithUserMsg,
      userMsgId,
      setChatStatus,
      setConversation
    )
  }

  const chatPageContext = {
    state: {
      ...defaultChatPageState,
      chatInput,
      chatStatus,
      selectedConversation: conversation,
    },
    dispatch: () => {},
    setChatInput,
    setChatStatus,
    setSelectedConversation: () => {},
    handleSend,
  } as ChatPageContextProps
  return (
    <ChatPageContext.Provider value={chatPageContext}>
      {conversation.messages.length == 0 ? (
        <div className={`flex flex-col overflow-hidden ${className ?? ''}`}>
          <StartChatFromHere
            className="flex-1"
            assistant={{ ...userAssistant, pinned: false, lastUsed: '', owner: '' }}
            onPrompt={(prompt) => {
              setChatInput(prompt)
              textareaRef?.current?.focus()
            }}
          ></StartChatFromHere>
          <ChatInput
            textAreaRef={textareaRef}
            disabled={sendDisabled}
            disabledMsg={t('configure_assistant_before_sending_messages')}
            onSend={handleSend}
          />
        </div>
      ) : (
        <div className={`flex flex-col overflow-hidden ${className ?? ''}`}>
          <Button
            variant="ghost"
            className="flex items-center gap-3 group focus:visible"
            onClick={clearConversation}
          >
            <h3 className="text-center">{t('preview')}</h3>
            <IconRotate
              size="18"
              className={chatStatus.state == 'idle' ? '' : 'invisible'}
            ></IconRotate>
          </Button>
          <Chat className={'flex-1'} assistant={userAssistant}></Chat>
        </div>
      )}
    </ChatPageContext.Provider>
  )
}

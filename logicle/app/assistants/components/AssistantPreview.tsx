import * as dto from '@/types/dto'
import { Chat } from '@/app/chat/components/Chat'
import ChatPageContext, { ChatPageContextProps } from '@/app/chat/components/context'
import { defaultChatPageState } from '@/app/chat/components/state'
import { nanoid } from 'nanoid'
import { useState } from 'react'
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

  const clearConversation = () => {
    setConversation({
      ...conversation,
      messages: [],
    })
  }

  const handleSend = async (
    content: string,
    attachment: dto.Attachment[],
    repeating?: dto.Message
  ) => {
    const userMsgId = nanoid()
    let parentMsgId: string | null = null
    if (repeating) {
      parentMsgId = repeating.parent
    } else if (conversation.messages.length != 0) {
      parentMsgId = conversation.messages[conversation.messages.length - 1].id
    }
    const userMessage = {
      id: userMsgId,
      conversationId: '',
      parent: parentMsgId,
      content,
      role: 'user',
      sentAt: new Date().toISOString(),
      attachments: attachment,
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
      chatStatus,
      selectedConversation: conversation,
    },
    dispatch: () => {},
    setChatStatus: setChatStatus,
    handleSend: handleSend,
  } as ChatPageContextProps
  return (
    <ChatPageContext.Provider value={chatPageContext}>
      {conversation.messages.length == 0 ? (
        <div className={`flex flex-col overflow-hidden ${className ?? ''}`}>
          <StartChatFromHere
            className="flex-1"
            assistant={{ ...userAssistant, pinned: false, lastUsed: '', owner: '' }}
          ></StartChatFromHere>
          <ChatInput
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

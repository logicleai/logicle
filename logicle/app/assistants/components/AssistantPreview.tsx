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

interface Props {
  assistant: dto.AssistantWithTools
  className?: string
}

export const AssistantPreview = ({ assistant, className }: Props) => {
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

  const handleSend = async (content: string, attachment: dto.Attachment[]) => {
    const userMsgId = nanoid()
    const userMessage = {
      id: userMsgId,
      conversationId: '',
      parent:
        conversation.messages.length == 0
          ? null
          : conversation.messages[conversation.messages.length - 1].id,
      content,
      role: 'user',
      sentAt: '',
      attachments: attachment,
    }

    const conversationWithUserMsg = appendMessage(conversation, userMessage)
    setConversation(conversationWithUserMsg)

    await fetchChatResponse(
      '/api/assistants/evaluate',
      JSON.stringify({
        assistant: assistant,
        messages: conversationWithUserMsg.messages,
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
          <ChatInput onSend={handleSend} />
        </div>
      ) : (
        <div className={`flex flex-col overflow-hidden ${className ?? ''}`}>
          <Button
            variant="ghost"
            className="flex items-center gap-3 group focus:visible"
            onClick={clearConversation}
          >
            <h3 className="text-center">Preview</h3>
            <IconRotate size="18" className="invisible group-hover:visible"></IconRotate>
          </Button>
          <Chat className={'flex-1'} assistant={userAssistant}></Chat>
        </div>
      )}
    </ChatPageContext.Provider>
  )
}

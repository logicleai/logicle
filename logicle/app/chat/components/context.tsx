import { createContext } from 'react'
import { ChatPageState } from './state'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'
import { ConversationWithMessages } from '@/lib/chat/types'

export interface SendMessageParams {
  msg:
    | { role: 'user'; content: string; attachments?: dto.Attachment[] }
    | { role: 'tool-auth-response'; allow: boolean }
  repeating?: dto.UserMessage
  conversation?: ConversationWithMessages
}

export interface ChatPageContextProps {
  state: ChatPageState
  setChatInput: (chatInput: string) => void
  setSelectedConversation: (conversation: ConversationWithMessages | undefined) => void
  setNewChatAssistantId: (assistantId: string | null) => void
  sendMessage?: (params: SendMessageParams) => void
}

const ChatPageContext = createContext<ChatPageContextProps>(undefined!)

export default ChatPageContext

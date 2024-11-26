import { createContext } from 'react'
import { ChatPageState } from './state'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'

export interface SendMessageParams {
  msg:
    | { role: 'user'; content: string; attachments?: dto.Attachment[] }
    | { role: 'tool-auth-response'; allow: boolean }
  repeating?: dto.Message
  conversation?: dto.ConversationWithMessages
}

export interface ChatPageContextProps {
  state: ChatPageState
  setChatInput: (chatInput: string) => void
  setChatStatus: (chatStatus: ChatStatus) => void
  setSelectedConversation: (conversation: dto.ConversationWithMessages | undefined) => void
  setNewChatAssistantId: (assistantId: string | null) => void
  handleSend: (params: SendMessageParams) => void
}

const ChatPageContext = createContext<ChatPageContextProps>(undefined!)

export default ChatPageContext

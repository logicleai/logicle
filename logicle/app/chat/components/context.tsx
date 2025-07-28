import { createContext } from 'react'
import { ChatPageState } from './state'
import * as dto from '@/types/dto'
import { ConversationWithMessages } from '@/lib/chat/types'

export interface SendMessageParams {
  msg:
    | { role: 'user'; content: string; attachments?: dto.Attachment[] }
    | { role: 'tool-auth-response'; allow: boolean }
  repeating?: dto.UserMessage
  conversation?: ConversationWithMessages
}

export type SideBarContent = {
  title: string
} & (
  | {
      type: 'citations'
      citations: dto.Citation[]
    }
  | {
      type: 'tool-call-result'
      toolCallResult: dto.ToolCallResult
    }
)

export interface ChatPageContextProps {
  state: ChatPageState
  setSelectedConversation: (conversation: ConversationWithMessages | undefined) => void
  setNewChatAssistantId: (assistantId: string | null) => void
  sendMessage?: (params: SendMessageParams) => void
  setChatInputElement: (chatInput: HTMLTextAreaElement | null) => void
  setSideBarContent?: (content: SideBarContent | undefined) => void
}

const ChatPageContext = createContext<ChatPageContextProps>(undefined!)

export default ChatPageContext

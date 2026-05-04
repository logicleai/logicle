import { createContext } from 'react'
import { ChatPageState } from './state'
import * as dto from '@/types/dto'
import { ConversationWithMessages } from '@/lib/chat/types'

export interface SendMessageParams {
  msg:
    | {
        role: 'user'
        content: string
        attachments?: dto.Attachment[]
        metadata?: Record<string, unknown>
      }
    | { role: 'user-response'; allow: boolean }
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

export interface ImageEditorState {
  attachment: dto.Attachment
  conversationId?: string
}

export interface ChatPageContextProps {
  state: ChatPageState
  setSelectedConversation: (conversation: ConversationWithMessages | undefined) => void
  getConversationSnapshot: (conversationId: string) => ConversationWithMessages | undefined
  loadConversation: (conversationId: string) => Promise<void>
  setNewChatAssistantId: (assistantId: string | null) => void
  sendMessage?: (params: SendMessageParams) => void
  requestStopActiveRun?: () => Promise<void>
  setSideBarContent?: (content: SideBarContent | undefined) => void
  openImageEditor?: (attachment: dto.Attachment, conversationId?: string) => void
}

const ChatPageContext = createContext<ChatPageContextProps>(undefined!)

export default ChatPageContext

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
  startNewChat?: boolean
}

export interface ChatPageContextProps {
  state: ChatPageState
  // The chat id the address bar currently points at (undefined = the
  // compose/"start a new chat" view). Switching this — via navigateToChat,
  // never next/navigation's router — is what lets /chat and /chat/[chatId]
  // behave as one persistently-mounted view instead of two Next pages, so
  // switching chats never triggers a full page reload. See navigateToChat.
  urlChatId: string | undefined
  // Changes the current chat (or, with undefined, goes back to the compose
  // view) without going through next/navigation's router. Under
  // output:'export' there's no RSC server, so Next's router can never
  // produce a soft-navigation payload for a runtime-only id like a chat id —
  // it always falls back to a full page reload (see staticFrontend.ts's
  // `/__next.` 404 short-circuit for where that fallback is triggered).
  // This updates the URL via history.pushState directly and flips urlChatId,
  // which the always-mounted ChatSection reacts to like any other state
  // change — no navigation, no remount, no blank screen.
  navigateToChat: (chatId: string | undefined) => void
  setSelectedConversation: (conversation: ConversationWithMessages | undefined) => void
  getConversationSnapshot: (conversationId: string) => ConversationWithMessages | undefined
  loadConversation: (conversationId: string) => Promise<void>
  setNewChatAssistantId: (assistantId: string | null) => void
  sendMessage?: (params: SendMessageParams) => void
  requestStopActiveRun?: () => Promise<void>
  setSideBarContent?: (content: SideBarContent | undefined) => void
  openImageEditor?: (
    attachment: dto.Attachment,
    options?: { conversationId?: string; startNewChat?: boolean }
  ) => void
}

const ChatPageContext = createContext<ChatPageContextProps>(undefined!)

export default ChatPageContext

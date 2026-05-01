import { ChatStatus } from '@/app/chat/components/ChatStatus'
import { ConversationWithMessages } from '@/lib/chat/types'
import { SideBarContent } from './context'

export interface ChatPageState {
  chatStatus: ChatStatus
  selectedConversation?: ConversationWithMessages
  newChatAssistantId: string | null
  userImageUrl?: string
  assistantUrl?: string
  sideBarContent?: SideBarContent
}

export const defaultChatPageState: ChatPageState = {
  chatStatus: { state: 'idle' },
  newChatAssistantId: null,
}

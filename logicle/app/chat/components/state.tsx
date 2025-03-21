import { ChatStatus } from '@/app/chat/components/ChatStatus'
import { ConversationWithMessages } from '@/lib/chat/types'

export interface ChatPageState {
  chatStatus: ChatStatus
  selectedConversation?: ConversationWithMessages
  newChatAssistantId: string | null
  userImageUrl?: string
  assistantUrl?: string
}

export const defaultChatPageState: ChatPageState = {
  chatStatus: { state: 'idle' },
  newChatAssistantId: null,
}

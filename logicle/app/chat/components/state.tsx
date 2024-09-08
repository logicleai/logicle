import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'

export interface ChatPageState {
  chatInput: string
  chatStatus: ChatStatus
  selectedConversation?: dto.ConversationWithMessages
  newChatAssistantId: string | null
  userImageUrl?: string
  assistantUrl?: string
}

export const defaultChatPageState: ChatPageState = {
  chatInput: '',
  chatStatus: { state: 'idle' },
  newChatAssistantId: null,
}

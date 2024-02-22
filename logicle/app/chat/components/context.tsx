import { Dispatch, createContext } from 'react'

import { ActionType } from '@/hooks/useCreateReducer'

import { ChatPageState } from './state'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import { Attachment, ConversationWithMessages, MessageDTO } from '@/types/chat'

export interface ChatPageContextProps {
  state: ChatPageState
  dispatch: Dispatch<ActionType<ChatPageState>>
  setChatStatus: (chatStatus: ChatStatus) => void
  handleSend: (
    content: string,
    attachment: Attachment[],
    repeating?: MessageDTO,
    conversation?: ConversationWithMessages
  ) => void
}

const ChatPageContext = createContext<ChatPageContextProps>(undefined!)

export default ChatPageContext

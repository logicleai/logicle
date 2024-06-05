import { Dispatch, createContext } from 'react'

import { ActionType } from '@/hooks/useCreateReducer'

import { ChatPageState } from './state'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'

export interface ChatPageContextProps {
  state: ChatPageState
  dispatch: Dispatch<ActionType<ChatPageState>>
  setChatStatus: (chatStatus: ChatStatus) => void
  handleSend: (
    content: string,
    attachment: dto.Attachment[],
    repeating?: dto.MessageDTO,
    conversation?: dto.ConversationWithMessages
  ) => void
}

const ChatPageContext = createContext<ChatPageContextProps>(undefined!)

export default ChatPageContext

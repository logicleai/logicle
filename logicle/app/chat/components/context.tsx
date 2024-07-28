import { Dispatch, createContext } from 'react'

import { ActionType } from '@/hooks/useCreateReducer'

import { ChatPageState } from './state'
import { ChatStatus } from '@/app/chat/components/ChatStatus'
import * as dto from '@/types/dto'

export interface SendMessageParams {
  content: string
  attachments?: dto.Attachment[]
  repeating?: dto.Message
  conversation?: dto.ConversationWithMessages
}

export interface ChatPageContextProps {
  state: ChatPageState
  dispatch: Dispatch<ActionType<ChatPageState>>
  setChatStatus: (chatStatus: ChatStatus) => void
  handleSend: (params: SendMessageParams) => void
}

const ChatPageContext = createContext<ChatPageContextProps>(undefined!)

export default ChatPageContext

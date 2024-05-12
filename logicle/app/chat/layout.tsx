'use client'

import { ChatPageContextProvider } from '@/app/chat/components/ChatPageContextProvider'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'

export default function ChatLayout({ children }) {
  const initialState: ChatPageState = {
    ...defaultChatPageState,
  }

  return <ChatPageContextProvider initialState={initialState}>{children}</ChatPageContextProvider>
}

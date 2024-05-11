'use client'

import { Chatbar } from '@/app/chat/components/chatbar/Chatbar'
import { ChatPageContextProvider } from '@/app/chat/components/ChatPageContextProvider'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'
import { MainLayout } from '@/app/layouts/MainLayout'

export default function ChatLayout({ children }) {
  const initialState: ChatPageState = {
    ...defaultChatPageState,
  }

  return <ChatPageContextProvider initialState={initialState}>{children}</ChatPageContextProvider>
}

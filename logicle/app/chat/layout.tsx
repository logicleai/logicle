'use client'

import { ChatPageContextProvider } from '@/app/chat/components/ChatPageContextProvider'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'
import { MainLayout } from '../layouts/MainLayout'
import { Chatbar } from './components/chatbar/Chatbar'

export default function ChatLayout({ children }) {
  const initialState: ChatPageState = {
    ...defaultChatPageState,
  }

  return (
    <ChatPageContextProvider initialState={initialState}>
      <MainLayout leftBar={<Chatbar />}>{children}</MainLayout>
    </ChatPageContextProvider>
  )
}

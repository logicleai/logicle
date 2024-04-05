'use client'

import { UserAssistant } from '@/types/chat'
import { Chatbar } from '@/app/chat/components/chatbar/Chatbar'
import { ChatPageContextProvider } from '@/app/chat/components/ChatPageContextProvider'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'
import { MainLayout } from '@/app/layouts/MainLayout'
import { useSWRJson } from '@/hooks/swr'
import { BackendConfigurationNeeded } from './components/BackendConfigurationNeeded'
import { useUserProfile } from '@/components/providers/userProfileContext'

function Wrapper({ children }) {
  const profile = useUserProfile()
  if (!profile) return <></>
  const assistants = profile.assistants
  if (assistants.length == 0) {
    return <BackendConfigurationNeeded />
  }
  return <>{children}</>
}

export default function ChatLayout({ children }) {
  const initialState: ChatPageState = {
    ...defaultChatPageState,
  }

  return (
    <ChatPageContextProvider initialState={initialState}>
      <MainLayout leftBar={<Chatbar />}>
        <Wrapper>{children}</Wrapper>
      </MainLayout>
    </ChatPageContextProvider>
  )
}

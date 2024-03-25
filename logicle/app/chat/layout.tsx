'use client'

import { UserAssistant } from '@/types/chat'
import { Chatbar } from '@/app/chat/components/chatbar/Chatbar'
import { ChatPageContextProvider } from '@/app/chat/components/ChatPageContextProvider'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'
import { MainLayout } from '@/app/layouts/MainLayout'
import { useSWRJson } from '@/hooks/swr'
import { BackendConfigurationNeeded } from './components/BackendConfigurationNeeded'

export default function ChatLayout({ children }) {
  const { data: assistants } = useSWRJson<UserAssistant[]>(`/api/user/assistants`)

  if (!assistants) {
    // it is very important to initialize ChatPageContextProvider only once,
    // so I return here an empty page (should be a "loading" page)
    return <></>
  }

  const initialState: ChatPageState = {
    ...defaultChatPageState,
    newChatAssistantId: assistants.length > 0 ? assistants[0].id : null,
  }

  return (
    <ChatPageContextProvider initialState={initialState}>
      <MainLayout leftBar={<Chatbar />}>
        {assistants.length == 0 ? <BackendConfigurationNeeded /> : <>{children}</>}
      </MainLayout>
    </ChatPageContextProvider>
  )
}

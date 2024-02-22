'use client'

import { UserAssistant } from '@/types/chat'
import { Chatbar } from '@/app/chat/components/chatbar/Chatbar'
import { ChatPageContextProvider } from '@/app/chat/components/ChatPageContextProvider'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'
import { MainLayout } from '@/app/layouts/MainLayout'
import { useSWRJson } from '@/hooks/swr'
import { BackendConfigurationNeeded } from './components/BackendConfigurationNeeded'
import { SelectableUserDTO } from '@/types/user'

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

export default function ChatLayout({ children }) {
  const { data: assistants } = useSWRJson<UserAssistant[]>(`/api/user/assistants`)
  const { data: user } = useSWRJson<SelectableUserDTO>(`/api/user/profile`)

  if (!assistants || !user) {
    // it is very important to initialize ChatPageContextProvider only once,
    // so I return here an empty page (should be a "loading" page)
    return <></>
  }

  const userImageUrl = user.image ? URL.createObjectURL(dataURLtoBlob(user.image)) : undefined

  const initialState: ChatPageState = {
    ...defaultChatPageState,
    newChatAssistantId: assistants.length > 0 ? assistants[0].id : null,
    userImageUrl,
    userName: user.name,
  }

  return (
    <ChatPageContextProvider initialState={initialState}>
      <MainLayout leftBar={<Chatbar />}>
        {assistants.length == 0 ? <BackendConfigurationNeeded /> : <>{children}</>}
      </MainLayout>
    </ChatPageContextProvider>
  )
}

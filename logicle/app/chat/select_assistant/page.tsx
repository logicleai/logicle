'use client'
import { WithLoadingAndError } from '@/components/ui'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatPageContext from '@/app/chat/components/context'
import { useSWRJson } from '@/hooks/swr'
import { UserAssistant } from '@/types/chat'
import { useRouter } from 'next/navigation'
import { useContext } from 'react'

const SelectAssistantPage = () => {
  const {
    isLoading,
    error,
    data: assistants_,
  } = useSWRJson<UserAssistant[]>('/api/user/assistants')
  const { dispatch } = useContext(ChatPageContext)
  const router = useRouter()
  const assistants = assistants_ ?? []
  // just simulate a lot of assistants
  //for(let a = 0; a < 5; a++) { assistants = [...assistants, ...assistants] }
  const handleSelect = (assistant: UserAssistant) => {
    dispatch({ field: 'newChatAssistantId', value: assistant.id })
    router.push('/chat')
  }
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="p-8 text-center">Select an assistant</h1>
      <WithLoadingAndError isLoading={isLoading} error={error}>
        <ScrollArea className="flex-1">
          <div className="max-w-[700px] w-2/3 grid grid-cols-2 m-auto gap-3">
            {(assistants ?? []).map((assistant) => {
              return (
                <button
                  key={assistant.id}
                  className="flex gap-3 p-1 border text-left w-full overflow-hidden h-18"
                  onClick={() => handleSelect(assistant)}
                >
                  <Avatar
                    className="shrink-0 self-center"
                    size="big"
                    url={assistant.icon ?? undefined}
                    fallback={assistant.name}
                  />
                  <div className="flex flex-col h-full">
                    <div className="font-bold">{assistant.name}</div>
                    <div className="opacity-50 overflow-hidden text-ellipsis line-clamp-2">
                      {assistant.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </WithLoadingAndError>
    </div>
  )
}

export default SelectAssistantPage

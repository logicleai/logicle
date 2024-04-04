import { FC } from 'react'
import { UserAssistant } from '@/types/chat'
import * as dto from '@/types/dto'
import { Button } from '@/components/ui/button'
import { patch } from '@/lib/fetch'
import { useSWRJson } from '@/hooks/swr'
import { mutate } from 'swr'
import { IconPinned } from '@tabler/icons-react'
import { Avatar } from '@/components/ui/avatar'

interface Props {
  conversation: dto.Conversation
}

const AssistantDescription: FC<Props> = ({ conversation }) => {
  const assistantId = conversation.assistantId
  const apiPath = `/api/user/assistants/${assistantId}`
  const { data: assistant } = useSWRJson<UserAssistant>(apiPath)

  async function togglePin(assistant: UserAssistant) {
    if (assistant != null) {
      await patch(apiPath, {
        pinned: !assistant.pinned,
      })
      await mutate(apiPath)
      await mutate(`/api/user/assistants`)
    }
  }

  return (
    <div className="group flex flex-row justify-center gap-3 h-16 items-center">
      {assistant && (
        <>
          <Avatar size="big" url={assistant.icon ?? undefined} fallback={assistant?.name ?? ''} />
          <h2 className=" flex justify-center py-2 bg-background">{assistant?.name ?? ''}</h2>
          <Button variant="ghost" size="icon" onClick={() => togglePin(assistant)}>
            {assistant.pinned ? (
              <IconPinned className="fill-primary_color stroke-primary_color" />
            ) : (
              <IconPinned className="opacity-50 invisible group-hover:visible" />
            )}
          </Button>
        </>
      )}
    </div>
  )
}

export default AssistantDescription

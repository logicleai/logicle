import * as dto from '@/types/dto'
import { patch } from '@/lib/fetch'
import { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { IconPinned } from '@tabler/icons-react'
import { Update } from 'next/dist/build/swc/types'

export const AssistantPin = ({ assistant }: { assistant: dto.UserAssistant }) => {
  const apiPath = `/api/user/assistants/${assistant.id}`
  async function togglePin(assistant: dto.UserAssistant) {
    await patch(apiPath, {
      pinned: !assistant.pinned,
    } as dto.UpdateableAssistantUserData)
    await mutate(apiPath)
    await mutate(`/api/user/profile`)
  }
  return (
    <Button variant="ghost" size="icon" onClick={() => togglePin(assistant)}>
      {assistant.pinned ? (
        <IconPinned className="fill-primary stroke-primary" />
      ) : (
        <IconPinned className="opacity-50 invisible group-hover:visible" />
      )}
    </Button>
  )
}

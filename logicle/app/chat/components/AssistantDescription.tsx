import { FC, useContext } from 'react'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import { stringToHslColor } from '@/components/ui/LetterAvatar'
import ChatPageContext from './context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { patch } from '@/lib/fetch'
import { mutate } from 'swr'
import { useTranslation } from 'next-i18next'

interface Props {
  assistant: dto.UserAssistant
}

const AssistantDescription: FC<Props> = ({ assistant }) => {
  const { t } = useTranslation('common')
  const {
    state: { selectedConversation },
  } = useContext(ChatPageContext)

  async function togglePin(assistant: dto.UserAssistant) {
    const apiPath = `/api/user/assistants/${assistant.id}`
    await patch(apiPath, {
      pinned: !assistant.pinned,
    })
    await mutate(apiPath)
    await mutate(`/api/user/profile`)
  }

  return (
    <div className="group flex flex-row justify-center px-2 gap-3 h-16 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex flex-row items-center gap-2">
            <Avatar
              size="default"
              url={assistant.iconUri ?? undefined}
              fallback={assistant.name}
              fallbackColor={stringToHslColor(assistant.id)}
            />
            <h3 className=" flex justify-center py-2 bg-background">{assistant?.name ?? ''}</h3>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="" sideOffset={5}>
          <DropdownMenuButton onClick={() => togglePin(assistant)}>
            {t(assistant.pinned ? 'hide-in-sidebar' : 'show-in-sidebar')}
          </DropdownMenuButton>
        </DropdownMenuContent>
      </DropdownMenu>
      <h3 className="flex-1 text-center">{selectedConversation?.name}</h3>
    </div>
  )
}

export default AssistantDescription

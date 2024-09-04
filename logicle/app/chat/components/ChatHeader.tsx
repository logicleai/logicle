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
import { IconChevronDown } from '@tabler/icons-react'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  assistant: dto.UserAssistant
}

export const ChatHeader: FC<Props> = ({ assistant }) => {
  const { t } = useTranslation('common')
  const router = useRouter()
  const {
    state: { selectedConversation },
  } = useContext(ChatPageContext)

  const profile = useUserProfile()

  const isAssistantMine = () => {
    return assistant.owner == profile?.id
  }

  async function onTogglePin() {
    const apiPath = `/api/user/assistants/${assistant.id}`
    await patch(apiPath, {
      pinned: !assistant.pinned,
    })
    await mutate(apiPath)
    await mutate(`/api/user/profile`)
  }

  async function onEditAssistant() {
    router.push(`/assistants/${assistant.id}`)
  }

  return (
    <div className="group flex flex-row justify-center px-2 gap-3 h-16 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="px-1 py-1">
            <div className="flex flex-row items-center gap-2">
              <Avatar
                size="default"
                url={assistant.iconUri ?? undefined}
                fallback={assistant.name}
                fallbackColor={stringToHslColor(assistant.id)}
              />
              <h3 className=" flex justify-center py-2">{assistant?.name ?? ''}</h3>
              <IconChevronDown size="16" color="gray"></IconChevronDown>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="" sideOffset={5}>
          <DropdownMenuButton onClick={onTogglePin}>
            {t(assistant.pinned ? 'hide-in-sidebar' : 'show-in-sidebar')}
          </DropdownMenuButton>
          {isAssistantMine() && (
            <DropdownMenuButton onClick={onEditAssistant}>{t('edit')}</DropdownMenuButton>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <h3 className="flex-1 text-center">{selectedConversation?.name}</h3>
    </div>
  )
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { AssistantAvatar } from '@/components/app/Avatars'
import { Button } from '@/components/ui/button'
import {
  IconChevronDown,
  IconInfoCircle,
  IconPinned,
  IconPinnedOff,
  IconSettings,
} from '@tabler/icons-react'
import { patch } from '@/lib/fetch'
import { mutate } from 'swr'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { FC, useContext, useState } from 'react'
import * as dto from '@/types/dto'
import { AssistantDetailsDialog } from '@/components/app/AssistantDetailsDialog'

interface Props {
  assistant: dto.UserAssistant
}

export const AssistantDropdown: FC<Props> = ({ assistant }) => {
  const { t } = useTranslation()
  const profile = useUserProfile()
  const router = useRouter()
  const [showDetailsDialog, setShowDetailsDialog] = useState<boolean>(false)

  const isAssistantMine = () => {
    return assistant.owner == profile?.id
  }
  async function onEditAssistant() {
    router.push(`/assistants/${assistant.id}`)
  }

  async function onTogglePinned() {
    const apiPath = `/api/user/assistants/${assistant.id}`
    await patch(apiPath, {
      pinned: !assistant.pinned,
    })
    await mutate(apiPath)
    await mutate(`/api/user/profile`)
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="px-1 py-1">
            <div className="flex flex-row items-center gap-2">
              <AssistantAvatar assistant={assistant} />
              <h3 className=" flex justify-center py-2">{assistant?.name ?? ''}</h3>
              <IconChevronDown size="16" color="gray"></IconChevronDown>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="" sideOffset={5}>
          <DropdownMenuButton
            icon={assistant.pinned ? IconPinnedOff : IconPinned}
            onClick={onTogglePinned}
          >
            {t(assistant.pinned ? 'hide-in-sidebar' : 'show-in-sidebar')}
          </DropdownMenuButton>
          {isAssistantMine() && (
            <DropdownMenuButton onClick={onEditAssistant} icon={IconSettings}>
              {t('edit')}
            </DropdownMenuButton>
          )}
          <DropdownMenuButton onClick={() => setShowDetailsDialog(true)} icon={IconInfoCircle}>
            {t('informations')}
          </DropdownMenuButton>
        </DropdownMenuContent>
      </DropdownMenu>
      {showDetailsDialog && (
        <AssistantDetailsDialog
          assistant={assistant}
          onClose={() => setShowDetailsDialog(false)}
        ></AssistantDetailsDialog>
      )}
    </>
  )
}

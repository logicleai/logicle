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
  IconCopy,
  IconInfoCircle,
  IconPinned,
  IconPinnedOff,
  IconSettings,
} from '@tabler/icons-react'
import { patch, post } from '@/lib/fetch'
import { mutate } from 'swr'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { FC, useState } from 'react'
import * as dto from '@/types/dto'
import { AssistantDetailsDialog } from '@/components/app/AssistantDetailsDialog'
import toast from 'react-hot-toast'

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

  const isAssistantCloneable = () => {
    return assistant.cloneable
  }

  async function onEditAssistant() {
    router.push(`/assistants/${assistant.id}`)
  }

  async function onCloneAssistant() {
    const assistantUrl = `/api/assistants/${assistant.id}/clone`
    const response = await post<dto.AssistantWithOwner>(assistantUrl)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(`/api/assistants`)
    await mutate('/api/user/profile') // Let the chat know that there are new assistants!
    router.push(`/assistants/${response.data.id}`)
  }

  async function onTogglePinned() {
    const apiPath = `/api/user/assistants/${assistant.id}`
    await patch(apiPath, {
      pinned: !assistant.pinned,
    } as Partial<dto.InsertableAssistantUserData>)
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
          {(isAssistantMine() || isAssistantCloneable()) && (
            <DropdownMenuButton onClick={onCloneAssistant} icon={IconCopy}>
              {t('duplicate')}
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

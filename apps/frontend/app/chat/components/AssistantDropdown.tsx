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
  IconLoader2,
  IconPinned,
  IconPinnedOff,
  IconSettings,
} from '@tabler/icons-react'
import { patch } from '@/lib/fetch'
import { mutate } from 'swr'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { FC, useState } from 'react'
import * as dto from '@/types/dto'
import { AssistantDetailsDialog } from '@/components/app/AssistantDetailsDialog'
import { useDuplicateAssistant } from '@/hooks/useDuplicateAssistant'
import { canEditAssistant } from '@/lib/rbac'
import { useEnvironment } from '@/app/context/environmentProvider'
import { useLayoutConfig } from '@/components/providers/layoutconfigContext'

interface Props {
  assistant: dto.UserAssistant
}

export const AssistantDropdown: FC<Props> = ({ assistant }) => {
  const { t } = useTranslation()
  const userProfile = useUserProfile()
  const router = useRouter()
  const environment = useEnvironment()
  const { isMobile } = useLayoutConfig()
  const [showDetailsDialog, setShowDetailsDialog] = useState<boolean>(false)
  const { duplicateAssistant, duplicatingAssistantId } = useDuplicateAssistant()
  const isAssistantMine = () => {
    return userProfile && canEditAssistant(assistant, userProfile?.id, userProfile.workspaces || [])
  }

  const isAssistantCloneable = () => {
    return environment.enableAssistantDuplicate && assistant.cloneable
  }

  async function onEditAssistant() {
    router.push(`/assistants/${assistant.id}`)
  }

  async function onCloneAssistant() {
    await duplicateAssistant(assistant.id)
  }

  async function onTogglePinned() {
    const apiPath = `/api/me/assistants/${assistant.id}`
    await patch(apiPath, {
      pinned: !assistant.pinned,
    } as dto.UpdateableAssistantUserData)
    await mutate(apiPath)
    await mutate(`/api/me/profile`)
  }

  if (duplicatingAssistantId !== null) {
    return (
      <div
        role="status"
        title={assistant.name}
        className="inline-flex max-w-[45vw] min-w-0 items-center gap-2 px-1 py-1"
      >
        <AssistantAvatar assistant={assistant} />
        <span className="inline-flex min-w-0 items-center gap-2 py-2">
          <IconLoader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />
          <span className="truncate">{t('duplicating')}</span>
        </span>
      </div>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="small" className="max-w-[45vw] px-1 py-1">
            <div className="flex min-w-0 flex-row items-center gap-2">
              <AssistantAvatar assistant={assistant} />
              <h3 className="truncate py-2">{assistant?.name ?? ''}</h3>
              <IconChevronDown className="shrink-0" size="16" color="gray"></IconChevronDown>
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
          {!isMobile && isAssistantMine() && (
            <DropdownMenuButton onClick={onEditAssistant} icon={IconSettings}>
              {t('edit')}
            </DropdownMenuButton>
          )}
          {!isMobile && (isAssistantMine() || isAssistantCloneable()) && (
            <DropdownMenuButton onClick={onCloneAssistant} icon={IconCopy}>
              {t('duplicate')}
            </DropdownMenuButton>
          )}
          {environment.enableAssistantInfo && (
            <DropdownMenuButton onClick={() => setShowDetailsDialog(true)} icon={IconInfoCircle}>
              {t('informations')}
            </DropdownMenuButton>
          )}
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

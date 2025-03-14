import { FC, useContext, useState } from 'react'
import * as dto from '@/types/dto'
import ChatPageContext from './context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { patch } from '@/lib/fetch'
import { mutate } from 'swr'
import { useTranslation } from 'react-i18next'
import {
  IconChevronDown,
  IconInfoCircle,
  IconPinned,
  IconPinnedOff,
  IconSettings,
} from '@tabler/icons-react'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AssistantAvatar } from '@/components/app/Avatars'
import { AssistantDetailsDialog } from '@/components/app/AssistantDetailsDialog'
import { ChatSharingDialog } from './ChatSharingDialog'
import { useEnvironment } from '@/app/context/environmentProvider'

interface Props {
  assistant: dto.UserAssistant
}

export const ChatHeader: FC<Props> = ({ assistant }) => {
  const { t } = useTranslation()
  const router = useRouter()
  const environment = useEnvironment()
  const {
    state: { selectedConversation },
  } = useContext(ChatPageContext)
  const [showDetailsDialog, setShowDetailsDialog] = useState<boolean>(false)
  const [showSharingDialog, setShowSharingDialog] = useState<boolean>(false)

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
              <AssistantAvatar assistant={assistant} />
              <h3 className=" flex justify-center py-2">{assistant?.name ?? ''}</h3>
              <IconChevronDown size="16" color="gray"></IconChevronDown>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="" sideOffset={5}>
          <DropdownMenuButton
            icon={assistant.pinned ? IconPinnedOff : IconPinned}
            onClick={onTogglePin}
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
      <h3 className="flex-1 text-center">{selectedConversation?.name}</h3>
      {environment.enableChatSharing && (
        <Button onClick={() => setShowSharingDialog(true)}>{t('share')}</Button>
      )}
      {showSharingDialog && (
        <ChatSharingDialog
          conversationId={selectedConversation?.id ?? ''}
          onClose={() => setShowSharingDialog(false)}
        ></ChatSharingDialog>
      )}
      {showDetailsDialog && (
        <AssistantDetailsDialog
          assistant={assistant}
          onClose={() => setShowDetailsDialog(false)}
        ></AssistantDetailsDialog>
      )}
    </div>
  )
}

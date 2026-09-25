import { IconDotsVertical, IconTrash, IconPencil } from '@tabler/icons-react'
import { useContext, useEffect, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { EditableLink } from '@/components/ui/EditableLink'
import * as dto from '@/types/dto'
import {
  deleteConversation,
  mutateConversationList,
  saveConversation,
} from '@/services/conversation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Menu, MenuItem } from '@/components/ui/menu'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { useTranslation } from 'react-i18next'
import { createDndChatReference } from '@/lib/dnd'
import { AssistantAvatar } from '@/components/app/Avatars'
import { useUserProfile } from '@/components/providers/userProfileContext'
import toast from 'react-hot-toast'

interface Props {
  conversation: dto.ConversationWithFolder
}

export const ConversationComponent = ({ conversation }: Props) => {
  const {
    state: { selectedConversation },
    setSelectedConversation,
    navigateToChat,
  } = useContext(ChatPageContext)

  const { t } = useTranslation()
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const modalContext = useConfirmationContext()
  const userPreferences: dto.UserPreferences = {
    ...dto.userPreferencesDefaults,
    ...(useUserProfile()?.preferences ?? {}),
  }

  const handleRename = async () => {
    if (renameValue.trim().length > 0) {
      const response = await saveConversation(conversation.id, {
        name: renameValue,
      })
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      if (selectedConversation && selectedConversation.id === conversation.id) {
        setSelectedConversation({
          ...selectedConversation,
          name: renameValue,
        })
      }
      await mutateConversationList()
      setRenameValue('')
      setIsRenaming(false)
    }
  }

  const handleOpenRenameModal = () => {
    setRenameValue(conversation.name)
    setIsRenaming(true)
  }

  const handleDragStart = async (evt: React.DragEvent) => {
    evt.dataTransfer?.setData(
      'application/json',
      JSON.stringify(createDndChatReference(conversation.id))
    )
  }

  const handleDelete = async () => {
    const confirmed = await modalContext.askConfirmation({
      title: `${t('remove-chat')} ${conversation.name}`,
      message: t('remove-chat-confirmation'),
      confirmMsg: t('remove-chat'),
    })
    if (confirmed) {
      const response = await deleteConversation(conversation.id)
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      await mutateConversationList()
      if (selectedConversation?.id === conversation.id) {
        navigateToChat(undefined)
      }
    }
  }

  useEffect(() => {
    if (selectedConversation?.id !== conversation.id) {
      setIsRenaming(false)
    }
  }, [isRenaming, selectedConversation?.id, conversation.id])

  return (
    <div
      data-testid="conversation-item"
      data-conversation-id={conversation.id}
      onDragStart={handleDragStart}
      className="relative flex min-w-0 items-center gap-2"
    >
      {userPreferences.showIconsInChatbar && (
        <AssistantAvatar
          size="small"
          className="shrink-0"
          assistant={conversation.assistant}
        ></AssistantAvatar>
      )}
      <EditableLink
        href={`/chat/${conversation.id}`}
        onNavigate={() => navigateToChat(conversation.id)}
        selected={selectedConversation?.id === conversation.id}
        renameValue={renameValue}
        isRenaming={isRenaming}
        onEnter={() => handleRename()}
        onCancel={() => setIsRenaming(false)}
        onRenameValueChange={(text) => setRenameValue(text)}
        value={conversation.name}
      ></EditableLink>

      {selectedConversation?.id === conversation.id && !isRenaming && (
        <div className="absolute right-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="px-1 py-1 opacity-50"
                aria-label={t('conversation-options')}
                title={t('conversation-options')}
              >
                <IconDotsVertical size={18} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Menu>
                <MenuItem icon={IconPencil} onClick={handleOpenRenameModal}>
                  {t('rename')}
                </MenuItem>
                <MenuItem icon={IconTrash} onClick={handleDelete} className="text-alert">
                  {t('delete')}
                </MenuItem>
              </Menu>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  )
}

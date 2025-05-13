import { IconDotsVertical, IconTrash, IconPencil } from '@tabler/icons-react'
import { useContext, useEffect, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { EditableButton } from '@/components/ui/EditableButton'
import * as dto from '@/types/dto'
import { deleteConversation, saveConversation } from '@/services/conversation'
import { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Menu, MenuItem } from '@/components/ui/menu'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { useTranslation } from 'react-i18next'
import { createDndChatReference } from '@/lib/dnd'

interface Props {
  conversation: dto.Conversation
}

export const ConversationComponent = ({ conversation }: Props) => {
  const {
    state: { selectedConversation },
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const { t } = useTranslation()
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const modalContext = useConfirmationContext()
  const router = useRouter()

  const handleRename = async () => {
    if (renameValue.trim().length > 0) {
      await saveConversation(conversation.id, {
        name: renameValue,
      })
      if (selectedConversation && selectedConversation.id == conversation.id) {
        setSelectedConversation({
          ...selectedConversation,
          name: renameValue,
        })
      }
      await mutate('/api/conversations')
      setRenameValue('')
      setIsRenaming(false)
    }
  }

  const handleOpenRenameModal = () => {
    setRenameValue(conversation.name)
    setIsRenaming(true)
  }

  const handleSelectConversation = async (conversation: dto.Conversation) => {
    router.push(`/chat/${conversation.id}`)
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
      await deleteConversation(conversation.id)
      await mutate('/api/conversations')
      router.push('/chat')
    }
  }

  useEffect(() => {
    if (selectedConversation?.id != conversation.id) {
      setIsRenaming(false)
    }
  }, [isRenaming, selectedConversation?.id, conversation.id])

  return (
    <div onDragStart={handleDragStart} className="relative flex items-center">
      <EditableButton
        selected={selectedConversation?.id === conversation.id}
        renameValue={renameValue}
        isRenaming={isRenaming}
        onClick={() => handleSelectConversation(conversation)}
        onEnter={() => handleRename()}
        onCancel={() => setIsRenaming(false)}
        onRenameValueChange={(text) => setRenameValue(text)}
        value={conversation.name}
      ></EditableButton>

      {selectedConversation?.id === conversation.id && !isRenaming && (
        <div className="absolute right-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="px-1 py-1 opacity-50">
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

import { IconDotsVertical, IconEdit, IconTrash } from '@tabler/icons-react'
import { useContext, useEffect, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { EditableButton } from '@/components/ui/EditableButton'
import { Conversation } from '@/types/db'
import { deleteConversation, saveConversation } from '@/services/conversation'
import { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Menu, MenuItem } from '@/components/ui/menu'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { useTranslation } from 'react-i18next'

interface Props {
  conversation: Conversation
}

export const ConversationComponent = ({ conversation }: Props) => {
  const {
    state: { selectedConversation, chatStatus },
  } = useContext(ChatPageContext)

  const { t } = useTranslation('common')
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const modalContext = useConfirmationContext()
  const router = useRouter()

  const handleRename = async () => {
    if (renameValue.trim().length > 0) {
      await saveConversation(conversation.id, {
        name: renameValue,
      })
      mutate('/api/conversations')
      setRenameValue('')
      setIsRenaming(false)
    }
  }

  const handleOpenRenameModal = () => {
    setRenameValue(conversation.name)
    setIsRenaming(true)
  }

  const handleSelectConversation = async (conversation: Conversation) => {
    router.push(`/chat/${conversation.id}`)
  }

  const handleDelete = async () => {
    const confirmed = await modalContext.askConfirmation({
      title: `${t('remove-chat')} ${conversation.name}`,
      message: <p>{t('remove-chat-confirmation')}</p>,
      confirmMsg: t('remove-chat'),
    })
    if (confirmed) {
      await deleteConversation(conversation.id)
      mutate('/api/conversations')
      router.push('/chat')
    }
  }

  useEffect(() => {
    if (selectedConversation?.id != conversation.id) {
      setIsRenaming(false)
    }
  }, [isRenaming, selectedConversation?.id, conversation.id])

  return (
    <div className="relative flex items-center">
      <EditableButton
        selected={selectedConversation?.id === conversation.id}
        enabled={chatStatus.state === 'idle'}
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
                <MenuItem icon={IconEdit} onClick={handleOpenRenameModal}>
                  rename
                </MenuItem>
                <MenuItem icon={IconTrash} onClick={handleDelete} className="text-alert">
                  delete
                </MenuItem>
              </Menu>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  )
}

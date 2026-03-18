import { FC, useContext, useEffect, useState } from 'react'
import * as dto from '@/types/dto'
import ChatPageContext from './context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ChatSharingDialog } from './ChatSharingDialog'
import { useEnvironment } from '@/app/context/environmentProvider'
import { AssistantDropdown } from './AssistantDropdown'
import { saveConversation } from '@/services/conversation'
import { mutate } from 'swr'

interface Props {
  assistant: dto.UserAssistant
}

export const ChatHeader: FC<Props> = ({ assistant }) => {
  const { t } = useTranslation()
  const environment = useEnvironment()
  const {
    state: { selectedConversation },
    setSelectedConversation,
  } = useContext(ChatPageContext)
  const [showSharingDialog, setShowSharingDialog] = useState<boolean>(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(selectedConversation?.name ?? '')
    }
  }, [isRenaming, selectedConversation?.name])

  const handleSaveRename = async () => {
    const trimmed = renameValue.trim()
    if (!selectedConversation || trimmed.length === 0) {
      setRenameValue(selectedConversation?.name ?? '')
      setIsRenaming(false)
      return
    }
    if (trimmed !== selectedConversation.name) {
      await saveConversation(selectedConversation.id, { name: trimmed })
      setSelectedConversation({
        ...selectedConversation,
        name: trimmed,
      })
      await mutate('/api/conversations')
    }
    setIsRenaming(false)
  }

  const handleCancelRename = () => {
    setRenameValue(selectedConversation?.name ?? '')
    setIsRenaming(false)
  }
  return (
    <div className="group flex flex-row justify-center px-2 gap-3 h-16 items-center">
      <AssistantDropdown assistant={assistant} />
      <h3 className="flex-1 text-center">
        {!isRenaming && (
          <button
            type="button"
            className="cursor-text truncate"
            onClick={() => {
              if (!selectedConversation) return
              setRenameValue(selectedConversation.name ?? '')
              setIsRenaming(true)
            }}
          >
            {selectedConversation?.name || t('untitled-conversation')}
          </button>
        )}
        {isRenaming && (
          <input
            className="max-w-[360px] w-full bg-transparent text-center text-h3 outline-none"
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => void handleSaveRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSaveRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                handleCancelRename()
              }
            }}
            autoFocus
          />
        )}
      </h3>
      {environment.enableChatSharing && (
        <Button onClick={() => setShowSharingDialog(true)}>{t('share')}</Button>
      )}
      {showSharingDialog && (
        <ChatSharingDialog
          conversationId={selectedConversation?.id ?? ''}
          onClose={() => setShowSharingDialog(false)}
        ></ChatSharingDialog>
      )}
    </div>
  )
}

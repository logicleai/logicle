import { IconEdit, IconTrash, IconGitBranch } from '@tabler/icons-react'
import { FC, useContext, useEffect, useState, useRef } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import * as dto from '@/types/dto'
import { IUserMessageGroup } from '@/lib/chat/types'
import { SiblingSwitcher } from './SiblingSwitcher'
import { delete_, put } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { getMessageAndDescendants } from '@/lib/chat/conversationUtils'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { MessageEdit, MessageEditHandle } from './MessageEdit'

interface UserMessageProps {
  message: dto.UserMessage
  enableActions?: boolean
  group: IUserMessageGroup
}
// User message edit without resending has been sacked
// let's comment it out for the moment
const enableUserMessageEdit = false

export const UserMessage: FC<UserMessageProps> = ({
  message,
  enableActions: enableActions_,
  group,
}) => {
  const { t } = useTranslation()
  const [editMode, setEditMode] = useState<'edit' | 'branch' | null>(null)
  const {
    state: { selectedConversation, chatStatus },
    sendMessage,
    setSelectedConversation,
  } = useContext(ChatPageContext)
  const [messageContent, setMessageContent] = useState(message.content)
  const modalContext = useConfirmationContext()
  const enableActions = enableActions_ ?? true
  const userPreferences: dto.UserPreferences = {
    ...dto.userPreferencesDefaults,
    ...(useUserProfile()?.preferences ?? {}),
  }
  const messageEditRef = useRef<MessageEditHandle | null>(null)
  const messageViewRef = useRef<HTMLDivElement | null>(null)
  const [editHeight, setEditHeight] = useState<number | undefined>(undefined)

  const isEditing = editMode !== null

  const handleInputChange = (text: string) => {
    setMessageContent(text)
  }

  const handleDelete = async () => {
    if (!selectedConversation) {
      return
    }
    if (
      !(await modalContext.askConfirmation({
        title: `${t('remove-message')}`,
        message: t('remove-message-confirmation'),
        confirmMsg: t('remove-message'),
      }))
    ) {
      return
    }
    const firstInGroup = group.message
    const idsToDelete = getMessageAndDescendants(
      group.message.id,
      selectedConversation.messages
    ).map((m) => m.id)
    const response = await delete_(
      `/api/conversations/${firstInGroup.conversationId}/messages?ids=${idsToDelete.join(',')}`
    )
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    setSelectedConversation({
      ...selectedConversation,
      messages: selectedConversation.messages.filter((m) => !idsToDelete.includes(m.id)),
    })
  }

  const handleBranchConfirm = () => {
    if (chatStatus.state !== 'idle') return
    const trimmed = messageContent.trim()
    if (!trimmed.length) return
    sendMessage?.({
      msg: { role: message.role, content: trimmed, attachments: message.attachments },
      repeating: message,
    })
    setEditMode(null)
  }

  const handleEditConfirm = async () => {
    if (chatStatus.state !== 'idle') return
    const trimmed = messageContent.trim()
    if (!trimmed.length) return
    try {
      if (message.content !== trimmed) {
        const patched = { ...message, content: trimmed }
        const res = await put(
          `/api/conversations/${message.conversationId}/messages/${message.id}`,
          patched
        )
        if ((res as any)?.error) {
          toast.error((res as any).error.message ?? t('something_went_wrong'))
          return
        }
        if (selectedConversation) {
          setSelectedConversation({
            ...selectedConversation,
            messages: selectedConversation.messages.map((m) => (m.id === message.id ? patched : m)),
          })
        }
      }
      setEditMode(null)
    } catch (err: any) {
      toast.error(err?.message ?? t('something_went_wrong'))
    }
  }

  useEffect(() => {
    setMessageContent(message.content)
  }, [message.content])

  useEffect(() => {
    if (!isEditing && messageViewRef.current) {
      // Capture height of the rendered message
      setEditHeight(messageViewRef.current.offsetHeight)
    }
  }, [isEditing, message.content])

  useEffect(() => {
    if (isEditing) {
      messageEditRef.current?.focus()
    }
  }, [isEditing])

  return (
    <div ref={messageViewRef} className="flex w-full flex-col">
      {isEditing ? (
        <MessageEdit
          value={messageContent}
          onChange={handleInputChange}
          onCancel={() => setEditMode(null)}
          ref={messageEditRef}
          height={editHeight}
          buttons={
            <div className="flex justify-center gap-2">
              <Button
                variant="primary"
                size="small"
                onClick={editMode === 'branch' ? handleBranchConfirm : handleEditConfirm}
                disabled={chatStatus.state !== 'idle' || messageContent.trim().length <= 0}
              >
                {editMode === 'branch' ? t('save_and_submit') : t('save')}
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  setMessageContent(message.content)
                  setEditMode(null)
                }}
              >
                {t('cancel')}
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="prose whitespace-pre-wrap">{message.content}</div>
          {enableActions && sendMessage && (
            <div className="mt-2 ml-1 flex flex-row gap-1 items-center justify-start">
              <SiblingSwitcher
                className="invisible group-hover:visible opacity-50 hover:opacity-100"
                id={group.message.id}
                siblings={group.siblings}
              ></SiblingSwitcher>
              <button
                type="button"
                title={t('edit_and_send_message')}
                className="invisible group-hover:visible"
                onClick={() => setEditMode('branch')}
                disabled={chatStatus.state !== 'idle'}
              >
                {enableUserMessageEdit ? (
                  <IconGitBranch size={20} className="opacity-50 hover:opacity-100" />
                ) : (
                  <IconEdit size={20} className="opacity-50 hover:opacity-100" />
                )}
              </button>
              {enableUserMessageEdit && userPreferences.conversationEditing && (
                <button
                  type="button"
                  title={t('edit_message')}
                  className="invisible group-hover:visible"
                  onClick={() => setEditMode('edit')}
                  disabled={chatStatus.state !== 'idle'}
                >
                  <IconEdit size={20} className="opacity-50 hover:opacity-100" />
                </button>
              )}
              {userPreferences.conversationEditing && (
                <button
                  type="button"
                  title={t('delete_message')}
                  className="invisible group-hover:visible"
                  onClick={handleDelete}
                >
                  <IconTrash size={20} className="opacity-50 hover:opacity-100" />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

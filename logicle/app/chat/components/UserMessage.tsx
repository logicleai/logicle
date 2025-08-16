import { IconEdit, IconTrash, IconGitBranch } from '@tabler/icons-react'
import { FC, useContext, useEffect, useState, useRef } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
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

interface UserMessageProps {
  message: dto.UserMessage
  enableActions?: boolean
  group: IUserMessageGroup
}

export const UserMessage: FC<UserMessageProps> = ({
  message,
  enableActions: enableActions_,
  group,
}) => {
  const { t } = useTranslation()
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const [editMode, setEditMode] = useState<'edit' | 'branch' | null>(null)
  const {
    state: { selectedConversation, chatStatus },
    sendMessage,
    setSelectedConversation,
  } = useContext(ChatPageContext)
  const [messageContent, setMessageContent] = useState(message.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalContext = useConfirmationContext()
  const enableActions = enableActions_ ?? true
  const userPreferences: dto.UserPreferences = {
    ...dto.userPreferencesDefaults,
    ...(useUserProfile()?.preferences ?? {}),
  }

  const isEditing = editMode !== null

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageContent(event.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !isTyping && !e.shiftKey) {
      e.preventDefault()
      if (editMode === 'branch') {
        handleBranchConfirm()
      } else if (editMode === 'edit') {
        handleEditConfirm()
      }
    }
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
      if (message.content != trimmed) {
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
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
    if (isEditing) {
      textareaRef.current?.focus()
    }
  }, [isEditing])

  return (
    <div className="flex w-full flex-col">
      {isEditing ? (
        <>
          <textarea
            ref={textareaRef}
            className="w-full resize-none whitespace-pre-wrap border-none bg-transparent prose"
            value={messageContent}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsTyping(true)}
            onCompositionEnd={() => setIsTyping(false)}
            style={{
              padding: '0',
              margin: '0',
              overflow: 'hidden',
            }}
          />

          <div className="mt-4 flex justify-center gap-4">
            <Button
              variant="primary"
              onClick={editMode === 'branch' ? handleBranchConfirm : handleEditConfirm}
              disabled={chatStatus.state !== 'idle' || messageContent.trim().length <= 0}
            >
              {editMode === 'branch' ? t('save_and_submit') : t('save')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setMessageContent(message.content)
                setEditMode(null)
              }}
            >
              {t('cancel')}
            </Button>
          </div>
        </>
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
                title={t('branch_from_here')}
                className="invisible group-hover:visible"
                onClick={() => setEditMode('branch')}
                disabled={chatStatus.state !== 'idle'}
              >
                <IconGitBranch size={20} className="opacity-50 hover:opacity-100" />
              </button>
              {userPreferences.conversationEditing && (
                <button
                  title={t('edit_message')}
                  className="invisible group-hover:visible"
                  onClick={() => setEditMode('edit')}
                  disabled={chatStatus.state !== 'idle'}
                >
                  <IconEdit size={20} className="opacity-50 hover:opacity-100" />
                </button>
              )}
              {userPreferences.conversationEditing && (
                <>
                  <button
                    title={t('delete_message')}
                    className="invisible group-hover:visible"
                    onClick={handleDelete}
                  >
                    <IconTrash size={20} className="opacity-50 hover:opacity-100" />
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

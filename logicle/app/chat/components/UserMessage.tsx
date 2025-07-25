import { IconEdit, IconTrash } from '@tabler/icons-react'
import { FC, useContext, useEffect, useState, useRef } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import * as dto from '@/types/dto'
import { IUserMessageGroup } from '@/lib/chat/types'
import { SiblingSwitcher } from './SiblingSwitcher'
import { delete_ } from '@/lib/fetch'
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
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const {
    state: { selectedConversation, chatStatus },
    sendMessage,
    setSelectedConversation,
  } = useContext(ChatPageContext)
  const toggleEditing = () => {
    setIsEditing(!isEditing)
  }
  const [messageContent, setMessageContent] = useState(message.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalContext = useConfirmationContext()
  const enableActions = enableActions_ ?? true
  const userPreferences: dto.UserPreferences = {
    ...dto.userPreferencesDefaults,
    ...(useUserProfile()?.preferences ?? {}),
  }
  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageContent(event.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  const handlePressEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !isTyping && !e.shiftKey) {
      e.preventDefault()
      handleEditSubmit()
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

  const handleEditSubmit = () => {
    if (chatStatus.state === 'idle') {
      if (message.content != messageContent) {
        sendMessage?.({
          msg: { role: message.role, content: messageContent, attachments: message.attachments },
          repeating: message,
        })
      }
      setIsEditing(false)
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
            onKeyDown={handlePressEnter}
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
              onClick={handleEditSubmit}
              disabled={chatStatus.state !== 'idle' || messageContent.trim().length <= 0}
            >
              {t('save_and_submit')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setMessageContent(message.content)
                setIsEditing(false)
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
                title={t('edit_message')}
                className="invisible group-hover:visible"
                onClick={toggleEditing}
              >
                <IconEdit size={20} className="opacity-50 hover:opacity-100" />
              </button>
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

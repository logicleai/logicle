import { IconEdit } from '@tabler/icons-react'
import { FC, useContext, useEffect, useState, useRef } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import * as dto from '@/types/dto'
import { MessageGroup } from '@/lib/chat/types'
import { SiblingSwitcher } from './SiblingSwitcher'

interface UserMessageProps {
  message: dto.UserMessage
  enableActions?: boolean
  group: MessageGroup
}

export const UserMessage: FC<UserMessageProps> = ({
  message,
  enableActions: enableActions_,
  group,
}) => {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const { state, sendMessage } = useContext(ChatPageContext)
  const toggleEditing = () => {
    setIsEditing(!isEditing)
  }
  const [messageContent, setMessageContent] = useState(message.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const enableActions = enableActions_ ?? true

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
      handleEditMessage()
    }
  }

  const handleEditMessage = () => {
    if (state.chatStatus.state === 'idle') {
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
              onClick={handleEditMessage}
              disabled={state.chatStatus.state !== 'idle' || messageContent.trim().length <= 0}
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
                className="invisible group-hover:visible focus:visible opacity-50 hover:opacity-100"
                id={group.messages[0].id}
                siblings={group.siblings}
              ></SiblingSwitcher>
              <button
                className="invisible group-hover:visible focus:visible"
                onClick={toggleEditing}
              >
                <IconEdit size={20} className="opacity-50 hover:opacity-100" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

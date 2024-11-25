import { IconEdit } from '@tabler/icons-react'
import { FC, useContext, useEffect, useState, useRef } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
import { useTranslation } from 'next-i18next'
import { Button } from '@/components/ui/button'
import * as dto from '@/types/dto'

interface UserMessageProps {
  message: dto.Message
}

export const UserMessage: FC<UserMessageProps> = ({ message }) => {
  const { t } = useTranslation('common')
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const { handleSend } = useContext(ChatPageContext)

  const toggleEditing = () => {
    setIsEditing(!isEditing)
  }

  const [messageContent, setMessageContent] = useState(message.content)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    if (message.content != messageContent) {
      handleSend({
        msg: { role: message.role, content: messageContent, attachments: message.attachments },
        repeating: message,
      })
    }
    setIsEditing(false)
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
              disabled={messageContent.trim().length <= 0}
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
              {t('Cancel')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="prose whitespace-pre-wrap">{message.content}</div>
          <div className="mt-2 ml-1 flex flex-row gap-1 items-center justify-start">
            <button className="invisible group-hover:visible focus:visible" onClick={toggleEditing}>
              <IconEdit size={20} className="opacity-50 hover:opacity-100" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

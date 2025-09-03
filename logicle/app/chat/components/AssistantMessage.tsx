'use client'
import { FC, MutableRefObject, useContext, useEffect, useMemo, useRef, useState } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
import { Upload } from '@/components/app/upload'
import { MemoizedMarkdown } from './Markdown'
import { Button } from '@/components/ui/button'
import { t } from 'i18next'
import { Attachment } from './Attachment'
import { Reasoning } from './Reasoning'
import { AssistantMessageEdit, AssistantMessageEditHandle } from './AssistantMessageEdit'
import { computeMarkdown } from './markdown/process'
import { UIAssistantMessagePart, UIAssistantMessage, UITextPart } from '@/lib/chat/types'
import { ToolCall } from './ChatMessage'
import { MessageError } from './ChatMessageError'

interface Props {
  message: UIAssistantMessage
  fireEdit?: MutableRefObject<(() => void) | null>
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      citation: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}

export const TextPart: FC<{
  part: UITextPart
  message: UIAssistantMessage
  fireEdit?: MutableRefObject<(() => void) | null>
}> = ({ part, message, fireEdit }) => {
  let className = 'prose flex-1 relative'
  if (part.running) {
    className += ' result-streaming'
  }
  const [isEditing, setIsEditing] = useState(false)
  const assistantMessageEditRef = useRef<AssistantMessageEditHandle | null>(null)

  useEffect(() => {
    if (isEditing) {
      assistantMessageEditRef.current?.focus()
    }
  }, [isEditing])

  if (fireEdit) {
    fireEdit.current = () => {
      setIsEditing(true)
    }
  }
  const processedMarkdown = useMemo(
    () => computeMarkdown(part.text, message.citations),
    [part.text, message.citations]
  )
  return (
    <>
      {isEditing ? (
        <AssistantMessageEdit
          onClose={() => setIsEditing(false)}
          ref={assistantMessageEditRef}
          message={message}
          part={part}
        />
      ) : (
        <MemoizedMarkdown className={className}>{processedMarkdown}</MemoizedMarkdown>
      )}
    </>
  )
}

export const AssistantMessagePart: FC<{
  part: UIAssistantMessagePart
  message: UIAssistantMessage
  fireEdit?: MutableRefObject<(() => void) | null>
}> = ({ part, message, fireEdit }) => {
  if (part.type === 'tool-call') {
    return <ToolCall toolCall={part} status={part.status} toolCallResult={part.result} />
  } else if (part.type === 'reasoning') {
    return <Reasoning running={part.running} text={part.reasoning} />
  } else if (part.type === 'text') {
    return <TextPart message={message} part={part} fireEdit={fireEdit} />
  } else if (part.type === 'error') {
    return <MessageError error={part.error} msgId={message.id}></MessageError>
  } else {
    return null
  }
}
export const AssistantMessage: FC<Props> = ({ fireEdit, message }) => {
  const { setSideBarContent } = useContext(ChatPageContext)

  return (
    <div className="flex flex-col relative">
      {message.attachments.map((attachment) => {
        const upload: Upload = {
          progress: 1,
          fileId: attachment.id,
          fileName: attachment.name,
          fileSize: attachment.size,
          fileType: attachment.mimetype,
          done: true,
        }
        return <Attachment key={attachment.id} file={upload}></Attachment>
      })}
      {message.parts.map((part, index) => {
        // Reasoning will stop when first content is received. Makes no sense
        return (
          <AssistantMessagePart key={index} message={message} fireEdit={fireEdit} part={part} />
        )
      })}
      {(message.citations?.length ?? 0) > 0 && (
        <div>
          <Button
            variant="secondary"
            size="small"
            rounded="full"
            onClick={() =>
              setSideBarContent?.({
                title: t('citations'),
                type: 'citations',
                citations: message.citations!,
              })
            }
          >
            {t('sources')}
          </Button>
        </div>
      )}
    </div>
  )
}

'use client'
import { FC, MutableRefObject, useEffect, useMemo, useRef, useState } from 'react'
import { MemoizedMarkdown } from './Markdown'
import { AssistantMessageEdit, AssistantMessageEditHandle } from './AssistantMessageEdit'
import { computeMarkdown } from './markdown/process'
import { UIAssistantMessage, UITextPart } from '@/lib/chat/types'

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

'use client'
import { FC, MutableRefObject, useContext } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import React from 'react'
import { Upload } from '@/components/app/upload'
import { Button } from '@/components/ui/button'
import { t } from 'i18next'
import { Attachment } from './Attachment'
import { Reasoning } from './Reasoning'
import { UIAssistantMessagePart, UIAssistantMessage } from '@/lib/chat/types'
import { ToolCall } from './ChatMessage'
import { MessageError } from './ChatMessageError'
import { ReasoningGroup, UIReasoningGroup, UIReasoningLikePart } from './ReasoningGroup'
import { TextPart } from './TextPart'

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

export const AssistantMessagePart: FC<{
  part: UIAssistantMessagePart | UIReasoningGroup
  message: UIAssistantMessage
  fireEdit?: MutableRefObject<(() => void) | null>
}> = ({ part, message, fireEdit }) => {
  if (part.type === 'tool-call') {
    return <ToolCall toolCall={part} status={part.status} toolCallResult={part.result} />
  } else if (part.type === 'reasoning') {
    return <Reasoning running={part.running} title={part.title} body={part.reasoning} />
  } else if (part.type === 'text') {
    return <TextPart message={message} part={part} fireEdit={fireEdit} />
  } else if (part.type === 'error') {
    return <MessageError error={part.error} msgId={message.id}></MessageError>
  } else if (part.type === 'reasoning-group') {
    return <ReasoningGroup parts={part.parts}></ReasoningGroup>
  } else {
    return null
  }
}

const canGroupInReasoning = (p: UIAssistantMessagePart) =>
  p.type === 'builtin-tool-result' || p.type === 'tool-call'

/**
 * Groups consecutive reasoning-like parts into a single bucket.
 */
function groupForReasoning(parts: UIAssistantMessagePart[]) {
  const grouped: Array<UIAssistantMessagePart | UIReasoningGroup> = []

  let buffer: UIReasoningLikePart[] = []

  for (const p of parts) {
    if (p.type == 'reasoning') {
      buffer.push(p)
    } else if (buffer.length != 0 && canGroupInReasoning(p)) {
      buffer.push(p)
    } else {
      if (buffer.length) {
        grouped.push({ type: 'reasoning-group', parts: buffer })
        buffer = []
      }
      grouped.push(p)
    }
  }

  if (buffer.length) {
    grouped.push({ type: 'reasoning-group', parts: buffer })
  }

  return grouped
}

export const AssistantMessage: FC<Props> = ({ fireEdit, message }) => {
  const groupedParts = groupForReasoning(message.parts)
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
      {groupedParts.map((part, index) => {
        return (
          <AssistantMessagePart key={index} message={message} fireEdit={fireEdit} part={part} />
        )
      })}
    </div>
  )
}

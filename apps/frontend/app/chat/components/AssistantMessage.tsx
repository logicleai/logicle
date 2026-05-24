'use client'
import { FC, MutableRefObject } from 'react'
import React from 'react'
import { UIAssistantMessagePart, UIAssistantMessage, UIReasoningGroup } from '@/lib/chat/types'
import { groupForReasoning } from '@/lib/chat/conversationUtils'
import * as dto from '@/types/dto'
import { ToolCall } from './ChatMessage'
import { MessageError } from './ChatMessageError'
import { ReasoningGroup } from './ReasoningGroup'
import { TextPart } from './TextPart'

interface Props {
  message: UIAssistantMessage
  fireEdit?: MutableRefObject<(() => void) | null>
  subAssistants?: dto.UserAssistant['subAssistants']
  assistantTools?: dto.UserAssistant['tools']
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
  subAssistants?: dto.UserAssistant['subAssistants']
  assistantTools?: dto.UserAssistant['tools']
}> = ({ part, message, fireEdit, subAssistants, assistantTools }) => {
  if (part.type === 'tool-call') {
    return (
      <ToolCall
        toolCall={part}
        status={part.status}
        toolCallResult={part.result}
        subAssistants={subAssistants}
        assistantTools={assistantTools}
      />
    )
  } else if (part.type === 'text') {
    return <TextPart message={message} part={part} fireEdit={fireEdit} />
  } else if (part.type === 'error') {
    return <MessageError error={part.error} msgId={message.id}></MessageError>
  } else if (part.type === 'reasoning-group') {
    return (
      <ReasoningGroup
        group={part}
        subAssistants={subAssistants}
        assistantTools={assistantTools}
      />
    )
  } else {
    // No reasoning here, as all reasoning parts go into ReasoningGroup
    return null
  }
}


export const AssistantMessage: FC<Props> = ({ fireEdit, message, subAssistants, assistantTools }) => {
  const groupedParts = groupForReasoning(message.parts)
  return (
    <div className="flex flex-col relative">
      {groupedParts.map((part, index) => {
        return (
          <AssistantMessagePart
            key={index}
            message={message}
            fireEdit={fireEdit}
            part={part}
            subAssistants={subAssistants}
            assistantTools={assistantTools}
          />
        )
      })}
    </div>
  )
}

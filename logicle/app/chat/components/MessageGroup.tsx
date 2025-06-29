import { FC, memo, useContext, useState } from 'react'

import React from 'react'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { stringToHslColor } from '@/components/ui/LetterAvatar'
import { IMessageGroup } from '@/lib/chat/types'
import { AssistantMessageGroup } from './AssistantMessageGroup'
import { Attachment, ChatMessageBody } from './ChatMessage'

interface ChatMessageProps {
  assistant: dto.AssistantIdentification
  group: IMessageGroup
  isLast: boolean
}

export const MessageGroup: FC<ChatMessageProps> = ({ assistant, group, isLast }) => {
  const userProfile = useUserProfile()

  if (group.actor == 'assistant') {
    return <AssistantMessageGroup assistant={assistant} group={group} isLast={isLast} />
  }
  const avatarUrl = userProfile?.image
  const avatarFallback = userProfile?.name ?? ''
  const messageTitle = 'You'
  const uploads = (group.messages[0].attachments ?? []).map((attachment) => {
    return {
      progress: 1,
      done: true,
      fileId: attachment.id,
      fileName: attachment.name,
      fileSize: attachment.size,
      fileType: attachment.mimetype,
    }
  })
  return (
    <div className="group flex p-4 text-base" style={{ overflowWrap: 'anywhere' }}>
      <div className="min-w-[40px]">
        <Avatar
          url={avatarUrl ?? undefined}
          fallback={avatarFallback}
          fallbackColor={stringToHslColor(assistant.id)}
        ></Avatar>
      </div>
      <div className="flex-1 min-w-0">
        <h3>{messageTitle}</h3>
        {uploads.length != 0 && (
          <div className="flex flex-col gap-2">
            {uploads.map((file) => {
              return <Attachment key={file.fileId} file={file} className="w-[250px]"></Attachment>
            })}
          </div>
        )}
        <div className="w-full">
          {group.messages.map((message, index) => {
            return (
              <ChatMessageBody
                key={message.id}
                message={message}
                isLastMessage={isLast && index + 1 == group.messages.length}
                showAlerts={true}
                group={group}
              ></ChatMessageBody>
            )
          })}
        </div>
      </div>
    </div>
  )
}
MessageGroup.displayName = 'MessageGroup'

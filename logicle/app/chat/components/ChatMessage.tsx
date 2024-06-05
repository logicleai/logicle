import { FC, memo } from 'react'

import React from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import { Upload } from '@/components/app/upload'
import { useUserProfile } from '@/components/providers/userProfileContext'

export interface ChatMessageProps {
  message: dto.MessageDTO
  assistantImageUrl?: string
  assistant: dto.UserAssistant
}

export const ChatMessage: FC<ChatMessageProps> = memo(
  ({ assistant, message, assistantImageUrl }) => {
    const userProfile = useUserProfile()
    const avatarUrl = message.role === 'user' ? userProfile?.avatarUrl : assistantImageUrl
    const avatarFallback = message.role === 'user' ? userProfile?.name ?? '' : assistant.name
    const messageTitle = message.role === 'user' ? 'You' : assistant.name
    const uploads = message.attachments.map((attachment) => {
      return {
        progress: 1,
        fileId: attachment.id,
        fileName: attachment.name,
        fileSize: attachment.size,
        fileType: attachment.mimetype,
      }
    })
    return (
      <div className="group flex p-4 text-base" style={{ overflowWrap: 'anywhere' }}>
        <div className="min-w-[40px]">
          <Avatar url={avatarUrl} fallback={avatarFallback}></Avatar>
        </div>
        <div className="flex-1 min-w-0">
          <h3>{messageTitle}</h3>
          {uploads.length != 0 && (
            <div className="flex flex-row flex-wrap gap-2">
              {uploads.map((file) => {
                return <Upload key={file.fileId} file={file} className="w-[250px] mt-2"></Upload>
              })}
            </div>
          )}
          <div className="w-full">
            {message.role === 'user' ? (
              <UserMessage message={message}></UserMessage>
            ) : (
              <AssistantMessage message={message}></AssistantMessage>
            )}
          </div>
        </div>
      </div>
    )
  }
)
ChatMessage.displayName = 'ChatMessage'

import { FC, memo, useContext } from 'react'

import React from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import ChatPageContext from '@/app/chat/components/context'
import { MessageDTO, UserAssistant } from '@/types/chat'
import { Avatar } from '@/components/ui/avatar'
import { Upload } from './Upload'

export interface ChatMessageProps {
  message: MessageDTO
  assistantImageUrl?: string
  assistant: UserAssistant
}

export const ChatMessage: FC<ChatMessageProps> = memo(
  ({ assistant, message, assistantImageUrl }) => {
    const { state } = useContext(ChatPageContext)
    const avatarUrl = message.role === 'user' ? state.userImageUrl : assistantImageUrl
    const avatarFallback = message.role === 'user' ? state.userName : assistant.name
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
        <div>
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

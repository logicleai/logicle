import { FC, memo, useContext } from 'react'

import React from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import { Upload } from '@/components/app/upload'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Button } from '@/components/ui/button'
import ChatPageContext from './context'
import { Assistant } from 'next/font/google'

export interface ChatMessageProps {
  message: dto.Message
  assistantImageUrl?: string
  assistant: dto.UserAssistant
  isLast: boolean
}

const ToolMessage = ({ message, isLast }: { message: dto.Message; isLast: boolean }) => {
  const {
    state: { chatStatus, selectedConversation },
    handleSend,
  } = useContext(ChatPageContext)
  const handleClick = () => {
    handleSend({ role: 'user', content: 'approvato', metadata: ['approved'] })
  }
  return <Button onClick={handleClick}>Confirm</Button>
}

const ChatMessageBody = ({ message, isLast }: { message: dto.Message; isLast: boolean }) => {
  switch (message.role) {
    case 'user':
      return <UserMessage message={message}></UserMessage>
    case 'assistant':
      if (message.metadata && message.metadata.length != 0) {
        return <ToolMessage message={message} isLast={isLast}></ToolMessage>
      }
      return <AssistantMessage message={message} isLast={isLast}></AssistantMessage>
    default:
      return <></>
  }
}

export const ChatMessage: FC<ChatMessageProps> = memo(
  ({ assistant, message, assistantImageUrl, isLast }) => {
    const userProfile = useUserProfile()
    const avatarUrl = message.role === 'user' ? userProfile?.image : assistantImageUrl
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
          <Avatar url={avatarUrl ?? undefined} fallback={avatarFallback}></Avatar>
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
            <ChatMessageBody message={message} isLast={isLast}></ChatMessageBody>
          </div>
        </div>
      </div>
    )
  }
)
ChatMessage.displayName = 'ChatMessage'

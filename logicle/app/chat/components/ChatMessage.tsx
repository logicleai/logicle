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

export interface ChatMessageProps {
  message: dto.Message
  assistantImageUrl?: string
  assistant: dto.UserAssistant
  isLast: boolean
}

const ToolMessage = ({ message, isLast }: { message: dto.Message; isLast: boolean }) => {
  const { handleSend } = useContext(ChatPageContext)
  const handleClick = (allow: boolean) => {
    handleSend({ role: 'user', content: allow ? 'allowed' : 'denied', confirmResponse: { allow } })
  }
  return (
    <div>
      <p>Invoke {JSON.stringify(message.confirmRequest)}</p>
      <div>
        <Button disabled={!isLast} onClick={() => handleClick(true)}>
          {`Allow`}
        </Button>
        <Button disabled={!isLast} onClick={() => handleClick(false)}>
          {`Deny`}
        </Button>
      </div>
    </div>
  )
}

const ChatMessageBody = ({ message, isLast }: { message: dto.Message; isLast: boolean }) => {
  switch (message.role) {
    case 'user':
      return <UserMessage message={message}></UserMessage>
    case 'assistant':
      if (message.confirmRequest) {
        return <ToolMessage message={message} isLast={isLast}></ToolMessage>
      }
      return <AssistantMessage message={message} isLast={isLast}></AssistantMessage>
    default:
      return <></>
  }
}

export const ChatMessage: FC<ChatMessageProps> = memo(
  ({ assistant, message, assistantImageUrl, isLast }) => {
    // Uncomment to verify that memoization is working
    // console.log(`Render message ${message.id} ${message.content.substring(0, 50)}`)
    // Note that message instances can be compared because we
    // never modify messages (see fetchChatResponse)
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

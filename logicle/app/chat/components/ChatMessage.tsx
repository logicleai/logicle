import { FC, memo, useContext, useState } from 'react'

import React from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import { Upload } from '@/components/app/upload'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Button } from '@/components/ui/button'
import ChatPageContext from './context'
import { cn } from '@/lib/utils'
import { IconFile } from '@tabler/icons-react'
import { stringToHslColor } from '@/components/ui/LetterAvatar'
import { MessageGroup } from '@/lib/chat/conversationUtils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useTranslation } from 'next-i18next'
import { IconCheck, IconCopy, IconRepeat } from '@tabler/icons-react'

export interface ChatMessageProps {
  assistant: dto.UserAssistant
  group: MessageGroup
  isLast: boolean
}

const showAllMessages = false

const AuthorizeMessage = ({ message, isLast }: { message: dto.Message; isLast: boolean }) => {
  const { handleSend } = useContext(ChatPageContext)
  const onAllowClick = (allow: boolean) => {
    handleSend({
      role: 'user',
      content: allow ? 'allowed' : 'denied',
      toolCallAuthResponse: { allow },
    })
  }
  return (
    <div>
      {showAllMessages && (
        <p>Authorization request for {JSON.stringify(message.toolCallAuthRequest)}</p>
      )}
      {isLast && (
        <div className="flex flex-horz gap-2">
          <Button size="small" onClick={() => onAllowClick(true)}>{`Allow`}</Button>
          <Button size="small" onClick={() => onAllowClick(false)}>{`Deny`}</Button>
        </div>
      )}
    </div>
  )
}

const ToolCall = ({ toolCall }: { toolCall: dto.ToolCall }) => {
  const { t } = useTranslation('common')
  return (
    <>
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1" style={{ border: 'none' }}>
          <AccordionTrigger className="py-1">
            <div className="text-sm">{`${t('invocation_of_tool')} ${toolCall.toolName}`}</div>
          </AccordionTrigger>
          <AccordionContent>
            <div>{`${t('parameters')}:`}</div>
            {Object.entries(toolCall.args).map(([key, value]) => (
              <div key={key}>{`${key}:${value}`}</div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  )
}

const ToolCallResult = ({ toolCallResult }: { toolCallResult: dto.ToolCallResult }) => {
  return (
    <div>
      <p>ToolCallResult {JSON.stringify(toolCallResult)}</p>
    </div>
  )
}

const ToolCallAuthResponse = ({
  toolCallAuthResponse,
}: {
  toolCallAuthResponse: dto.ToolCallAuthResponse
}) => {
  return (
    <div>
      <p>ToolCallAuthResponse: {JSON.stringify(toolCallAuthResponse)}</p>
    </div>
  )
}

const compareChatMessage = (
  a: { message: dto.Message; isLast: boolean },
  b: { message: dto.Message; isLast: boolean }
) => {
  return a.message == b.message && a.isLast == b.isLast
}

const ChatMessageBody = memo(({ message, isLast }: { message: dto.Message; isLast: boolean }) => {
  // Uncomment to verify that memoization is working
  //console.log(`Render message ${message.id} ${message.content.substring(0, 50)}`)
  // Note that message instances can be compared because we
  // never modify messages (see fetchChatResponse)
  switch (message.role) {
    case 'user':
      if (message.toolCallAuthResponse) {
        return showAllMessages ? (
          <ToolCallAuthResponse
            toolCallAuthResponse={message.toolCallAuthResponse}
          ></ToolCallAuthResponse>
        ) : (
          <></>
        )
      }
      return <UserMessage message={message}></UserMessage>
    case 'assistant':
      if (message.toolCall) {
        return <ToolCall toolCall={message.toolCall}></ToolCall>
      }
      return <AssistantMessage message={message} isLast={isLast}></AssistantMessage>
    case 'tool':
      if (message.toolCallAuthRequest) {
        return <AuthorizeMessage message={message} isLast={isLast}></AuthorizeMessage>
      }
      if (message.toolCallResult) {
        return showAllMessages ? (
          <ToolCallResult toolCallResult={message.toolCallResult}></ToolCallResult>
        ) : (
          <></>
        )
      }
      return <AssistantMessage message={message} isLast={isLast}></AssistantMessage>
    default:
      return <>????</>
  }
}, compareChatMessage)

ChatMessageBody.displayName = 'ChatMessageBody'

interface AttachmentProps {
  file: Upload
  className?: string
}

export const isImage = (mimeType: string) => {
  return mimeType.startsWith('image/')
}

export const Attachment = ({ file, className }: AttachmentProps) => {
  return (
    <div
      className={cn(
        'border p-2 flex flex-row items-center gap-2 relative shadow rounded',
        className
      )}
    >
      <div className="overflow-hidden">
        {isImage(file.fileType) ? (
          <img src={`/api/files/${file.fileId}/content`}></img>
        ) : (
          <div className="flex gap-2 items-center">
            <div className="bg-primary_color p-2 rounded">
              <IconFile color="white" size="24"></IconFile>
            </div>
            <div className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
              {file.fileName}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const ChatMessage: FC<ChatMessageProps> = ({ assistant, group, isLast }) => {
  const userProfile = useUserProfile()
  const avatarUrl = group.actor === 'user' ? userProfile?.image : assistant.iconUri
  const avatarFallback = group.actor === 'user' ? userProfile?.name ?? '' : assistant.name
  const messageTitle = group.actor === 'user' ? 'You' : assistant.name
  const [messagedCopied, setMessageCopied] = useState(false)
  const {
    state: { chatStatus, selectedConversation },
    handleSend,
  } = useContext(ChatPageContext)

  const insertAssistantActionBar =
    (!isLast || chatStatus.state === 'idle') && group.actor == 'assistant'

  const onClickCopy = () => {
    if (!navigator.clipboard) return
    const text = group.messages.map((m) => m.content).join()
    navigator.clipboard.writeText(text).then(() => {
      setMessageCopied(true)
      setTimeout(() => {
        setMessageCopied(false)
      }, 2000)
    })
  }

  const findAncestorUserMessage = (msgId: string) => {
    if (!selectedConversation) return undefined
    const idToMessage = Object.fromEntries(selectedConversation.messages.map((m) => [m.id, m]))
    let msg = idToMessage[msgId]
    while (msg) {
      if (msg.role == 'user' && !msg.toolCallAuthResponse) {
        return msg
      }
      if (!msg.parent) break
      msg = idToMessage[msg.parent]
    }
    return undefined
  }
  const onRepeatLastMessage = () => {
    const messageToRepeat = findAncestorUserMessage(group.messages[0].id)
    if (messageToRepeat) {
      handleSend({
        content: messageToRepeat.content,
        attachments: messageToRepeat.attachments,
        repeating: messageToRepeat,
      })
    }
  }

  const uploads =
    group.actor == 'user'
      ? group.messages[0].attachments.map((attachment) => {
          return {
            progress: 1,
            fileId: attachment.id,
            fileName: attachment.name,
            fileSize: attachment.size,
            fileType: attachment.mimetype,
          }
        })
      : []
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
                isLast={isLast && index + 1 == group.messages.length}
              ></ChatMessageBody>
            )
          })}
        </div>
        {insertAssistantActionBar && (
          <div className="mt-2 md:-mr-8 ml-1 md:ml-0 flex flex-col md:flex-row gap-4 md:gap-1 items-center md:items-start justify-end md:justify-start">
            {messagedCopied ? (
              <IconCheck size={20} className="text-green-500" />
            ) : (
              <button
                className={`${isLast ? 'visible' : 'invisible group-hover:visible'} focus:visible`}
                onClick={onClickCopy}
              >
                <IconCopy size={20} className="opacity-50 hover:opacity-100" />
              </button>
            )}
            {isLast && (
              <button onClick={onRepeatLastMessage}>
                <IconRepeat size={20} className={`opacity-50 hover:opacity-100`} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
ChatMessage.displayName = 'ChatMessage'

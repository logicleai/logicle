import { FC, memo, useContext, useState } from 'react'

import { RotatingLines } from 'react-loader-spinner'
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
import { MessageExt, MessageGroup, ToolCallMessageExt } from '@/lib/chat/conversationUtils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconCopy, IconRepeat } from '@tabler/icons-react'
import { IconDownload } from '@tabler/icons-react'

export interface ChatMessageProps {
  assistant: dto.UserAssistant
  group: MessageGroup
  isLast: boolean
}

const showAllMessages = false

const AuthorizeMessage = ({ isLast }: { isLast: boolean }) => {
  const { handleSend } = useContext(ChatPageContext)
  const onAllowClick = (allow: boolean) => {
    handleSend({
      msg: {
        role: 'tool-auth-response',
        allow,
      },
    })
  }
  return (
    <div>
      {isLast && (
        <div className="flex flex-horz gap-2">
          <Button size="small" onClick={() => onAllowClick(true)}>{`Allow`}</Button>
          <Button size="small" onClick={() => onAllowClick(false)}>{`Deny`}</Button>
        </div>
      )}
    </div>
  )
}

const ToolCall = ({ toolCall }: { toolCall: ToolCallMessageExt }) => {
  const { t } = useTranslation()
  return (
    <>
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1" style={{ border: 'none' }}>
          <AccordionTrigger className="py-1">
            <div className="flex flex-horz items-center gap-2">
              <div className="text-sm">{`${t('invocation_of_tool')} ${toolCall.toolName}`}</div>
              {toolCall.status == 'running' ? (
                <RotatingLines width="16" strokeColor="gray"></RotatingLines>
              ) : (
                <></>
              )}
            </div>
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

const ToolDebug = ({ msg }: { msg: dto.DebugMessage }) => {
  return (
    <>
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1" style={{ border: 'none' }}>
          <AccordionTrigger className="py-1">
            <div className="text-sm overflow-hidden text-ellipsis nowrap text-start w-0 flex-1 whitespace-nowrap">
              {msg.displayMessage}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div>{JSON.stringify(msg.data, null, 2)}</div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  )
}

const ToolCallResult = ({ toolCallResult }: { toolCallResult: dto.ToolCallResult }) => {
  return (
    <div>
      {/* eslint-disable-next-line i18next/no-literal-string */}{' '}
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
      {/* eslint-disable-next-line i18next/no-literal-string */}{' '}
      <p>ToolCallAuthResponse: {JSON.stringify(toolCallAuthResponse)}</p>
    </div>
  )
}

const compareChatMessage = (
  a: { message: MessageExt; isLastMessage: boolean },
  b: { message: MessageExt; isLastMessage: boolean }
) => {
  return a.message == b.message && a.isLastMessage == b.isLastMessage
}

const ChatMessageBody = memo(
  ({ message, isLastMessage }: { message: MessageExt; isLastMessage: boolean }) => {
    // Uncomment to verify that memoization is working
    //console.log(`Render message ${message.id} ${message.content.substring(0, 50)}`)
    // Note that message instances can be compared because we
    // never modify messages (see fetchChatResponse)
    switch (message.role) {
      case 'tool-auth-response':
        return showAllMessages ? (
          <ToolCallAuthResponse toolCallAuthResponse={message}></ToolCallAuthResponse>
        ) : (
          <></>
        )
      case 'user':
        return <UserMessage message={message}></UserMessage>
      case 'tool-call':
        return <ToolCall toolCall={message}></ToolCall>
      case 'assistant':
        return <AssistantMessage message={message}></AssistantMessage>
      case 'tool-debug':
        return <ToolDebug msg={message} />
      case 'tool-auth-request':
        return <AuthorizeMessage isLast={isLastMessage}></AuthorizeMessage>
      case 'tool-result':
        return showAllMessages ? <ToolCallResult toolCallResult={message}></ToolCallResult> : <></>
      case 'tool-output':
        return <AssistantMessage message={message}></AssistantMessage>
      default:
        return <div>{`Unsupported role ${message['role']}`}</div>
    }
  },
  compareChatMessage
)

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
        'border p-2 flex flex-row items-center gap-2 relative shadow rounded relative group/attachment',
        className
      )}
    >
      <div className="overflow-hidden">
        {isImage(file.fileType) ? (
          <img alt="" src={`/api/files/${file.fileId}/content`}></img>
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
        <div
          className="rounded-md m-2 absolute top-0 right-0 bg-black bg-opacity-30 invisible group-hover/attachment:visible cursor-pointer"
          onClick={() => {
            const link = document.createElement('a')
            link.download = file.fileName
            link.href = `/api/files/${file.fileId}/content`
            link.style.display = 'none'
            link.click()
          }}
        >
          <IconDownload className="m-2" size={24} color="white"></IconDownload>
        </div>
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

  const onClickCopy = async () => {
    if (!navigator.clipboard) return
    const text = group.messages.map((m) => m.content).join()
    await navigator.clipboard.writeText(text).then(() => {
      setMessageCopied(true)
      setTimeout(() => {
        setMessageCopied(false)
      }, 2000)
    })
  }

  const findAncestorUserMessage = (msgId: string): dto.UserMessage | undefined => {
    if (!selectedConversation) return undefined
    const idToMessage = Object.fromEntries(selectedConversation.messages.map((m) => [m.id, m]))
    let msg = idToMessage[msgId]
    while (msg) {
      if (msg.role == 'user') {
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
        msg: {
          role: messageToRepeat.role,
          content: messageToRepeat.content,
          attachments: messageToRepeat.attachments,
        },
        repeating: messageToRepeat,
      })
    }
  }

  const uploads =
    group.actor == 'user'
      ? (group.messages[0].attachments ?? []).map((attachment) => {
          return {
            progress: 1,
            done: true,
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
                isLastMessage={isLast && index + 1 == group.messages.length}
              ></ChatMessageBody>
            )
          })}
        </div>
        {insertAssistantActionBar && (
          <div className="mt-2 ml-1 flex flex-row gap-1 items-center justify-start">
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

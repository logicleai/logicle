import { FC, memo, useContext, useState } from 'react'

import { RotatingLines } from 'react-loader-spinner'
import React from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage, computeMarkdown } from './AssistantMessage'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import { Upload } from '@/components/app/upload'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Button } from '@/components/ui/button'
import ChatPageContext from './context'
import { cn } from '@/lib/utils'
import { IconFile } from '@tabler/icons-react'
import { stringToHslColor } from '@/components/ui/LetterAvatar'
import { MessageWithErrorExt, MessageGroup, ToolCallMessageEx } from '@/lib/chat/types'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconCopy, IconRepeat } from '@tabler/icons-react'
import { IconDownload } from '@tabler/icons-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AssistantMessageMarkdown } from './AssistantMessageMarkdown'
import ReactDOM from 'react-dom/client'
import { useEnvironment } from '@/app/context/environmentProvider'
import { SiblingSwitcher } from './SiblingSwitcher'
import { remark } from 'remark'
import strip from 'strip-markdown'
import { IconCopyText } from './icons'

export interface ChatMessageProps {
  assistant: dto.AssistantIdentification
  group: MessageGroup
  isLast: boolean
}

const showAllMessages = true

const findAncestorUserMessage = (
  messages: dto.Message[],
  msgId: string
): dto.UserMessage | undefined => {
  const idToMessage = Object.fromEntries(messages.map((m) => [m.id, m]))
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

const ErrorMessage = ({ msg }: { msg: dto.ErrorMessage }) => {
  return <div>{msg.content}</div>
}

const AuthorizeMessage = ({ isLast }: { isLast: boolean }) => {
  const { sendMessage } = useContext(ChatPageContext)
  const onAllowClick = (allow: boolean) => {
    sendMessage?.({
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

const ToolCall = ({ toolCall }: { toolCall: ToolCallMessageEx }) => {
  const { t } = useTranslation()
  const { setSideBarContent } = useContext(ChatPageContext)
  const environment = useEnvironment()
  const toolCallResult = toolCall.result
  return (
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
          <div className="flex">
            <div className="flex-1">
              <div>{`${t('parameters')}:`}</div>
              {Object.entries(toolCall.args).map(([key, value]) => (
                <div key={key}>{`${key}:${JSON.stringify(value)}`}</div>
              ))}
            </div>
            {toolCallResult && environment.enableShowToolResult && (
              <Button
                variant="secondary"
                rounded="full"
                size="small"
                onClick={() =>
                  setSideBarContent?.({
                    title: t('tool_call_result'),
                    type: 'toolCallResult',
                    toolCallResult: toolCallResult,
                  })
                }
              >
                {t('result')}
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

const ToolDebug = ({ msg }: { msg: dto.DebugMessage }) => {
  return (
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

const ChatMessageBody = ({
  message,
  isLastMessage,
  showAlerts,
  group,
}: {
  message: MessageWithErrorExt
  isLastMessage: boolean
  showAlerts: boolean
  group: MessageGroup
}) => {
  const { t } = useTranslation()
  const { sendMessage, state } = useContext(ChatPageContext)
  if (showAlerts && message.error) {
    return (
      <>
        <ChatMessageBody
          message={{ ...message, error: undefined }}
          isLastMessage={isLastMessage}
          showAlerts={false}
          group={group}
        ></ChatMessageBody>
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            <div className="flex items-center">
              <div className="flex-1">{t(message.error)} </div>
              {sendMessage && (
                <Button
                  size="small"
                  className="shrink-0"
                  onClick={() => {
                    const messageToRepeat = findAncestorUserMessage(
                      state.selectedConversation?.messages ?? [],
                      message.id
                    )
                    if (messageToRepeat) {
                      sendMessage({
                        msg: {
                          role: messageToRepeat.role,
                          content: messageToRepeat.content,
                          attachments: messageToRepeat.attachments,
                        },
                        repeating: messageToRepeat,
                      })
                    }
                  }}
                >
                  {t('retry')}
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      </>
    )
  }
  switch (message.role) {
    case 'tool-auth-response':
      return showAllMessages ? (
        <ToolCallAuthResponse toolCallAuthResponse={message}></ToolCallAuthResponse>
      ) : (
        <></>
      )
    case 'user':
      return (
        <UserMessage message={message} enableActions={!message.error} group={group}></UserMessage>
      )
    case 'tool-call':
      return <ToolCall toolCall={message}></ToolCall>
    case 'assistant':
      return <AssistantMessage message={message}></AssistantMessage>
    case 'tool-debug':
      return <ToolDebug msg={message} />
    case 'tool-auth-request':
      return <AuthorizeMessage isLast={isLastMessage}></AuthorizeMessage>
    case 'tool-result':
      return <></>
    case 'tool-output':
      return <AssistantMessage message={message}></AssistantMessage>
    case 'error':
      return <ErrorMessage msg={message}></ErrorMessage>
    default:
      return <div>{`Unsupported role ${message['role']}`}</div>
  }
}

ChatMessageBody.displayName = 'ChatMessageBody'

interface AttachmentProps {
  file: Upload
  className?: string
}

export const isImage = (mimeType: string) => {
  return mimeType.startsWith('image/')
}

export const Attachment = ({ file, className }: AttachmentProps) => {
  function copyImageToClipboard(imageUrl) {
    fetch(imageUrl)
      .then((res) => res.blob())
      .then((blob) => {
        // The MIME type should match your image type, e.g., image/png, image/jpeg, etc.
        const data = [new window.ClipboardItem({ [blob.type]: blob })]
        return navigator.clipboard.write(data)
      })
      .then(() => {
        alert('Image copied to clipboard!')
      })
      .catch((err) => {
        alert('Failed to copy image: ' + err.message)
      })
  }
  return (
    <div
      className={cn(
        'border p-2 m-2 flex flex-row items-center relative shadow rounded relative group/attachment',
        className
      )}
    >
      <div className="overflow-hidden">
        {isImage(file.fileType) ? (
          <img alt="" src={`/api/files/${file.fileId}/content`}></img>
        ) : (
          <div className="flex gap-2 items-center">
            <div className="bg-primary p-2 rounded">
              <IconFile color="white" size="24"></IconFile>
            </div>
            <div className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
              {file.fileName}
            </div>
          </div>
        )}
        <div className="flex flex-horz m-2 gap-1 absolute top-0 right-0 invisible group-hover/attachment:visible">
          {isImage(file.fileType) && (
            <button
              className="bg-black bg-opacity-30 rounded-md"
              onClick={() => copyImageToClipboard(`/api/files/${file.fileId}/content`)}
            >
              <IconCopy className="m-2" size={24} color="white"></IconCopy>
            </button>
          )}
          <button
            className="bg-black bg-opacity-30 rounded-md"
            onClick={() => {
              const link = document.createElement('a')
              link.download = file.fileName
              link.href = `/api/files/${file.fileId}/content`
              link.style.display = 'none'
              link.click()
            }}
          >
            <IconDownload className="m-2" size={24} color="white"></IconDownload>
          </button>
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
  const [markdownCopied, setMarkdownCopied] = useState(false)
  const [textCopied, setTextCopied] = useState(false)
  const {
    state: { chatStatus, selectedConversation },
    sendMessage,
  } = useContext(ChatPageContext)

  const insertAssistantActionBar =
    (!isLast || chatStatus.state === 'idle') && group.actor == 'assistant'

  const extractAssistantMarkdown = () => {
    return group.messages
      .filter((m) => m.role == 'assistant')
      .map((m) => computeMarkdown(m))
      .join()
  }
  const onClickCopyText = async () => {
    if (!navigator.clipboard) return
    const text = String(await remark().use(strip).process(extractAssistantMarkdown()))
    await navigator.clipboard.writeText(text).then(() => {
      setTextCopied(true)
      setTimeout(() => {
        setTextCopied(false)
      }, 2000)
    })
  }
  const onClickCopyMarkdown = async () => {
    if (!navigator.clipboard) return
    const markdown = extractAssistantMarkdown()
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.visibility = 'hidden'
    document.body.appendChild(container)

    // 2️⃣ Render ReactMarkdown into it
    const root = ReactDOM.createRoot(container)
    root.render(
      <AssistantMessageMarkdown forExport={true} className="">
        {markdown}
      </AssistantMessageMarkdown>
    )

    // 3️⃣ After next paint, grab HTML, copy, cleanup
    requestAnimationFrame(async () => {
      const html = container.innerHTML
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([markdown], { type: 'text/plain' }),
          }),
        ])
      } finally {
        root.unmount()
        document.body.removeChild(container)
      }
    })

    await navigator.clipboard.writeText(markdown).then(() => {
      setMarkdownCopied(true)
      setTimeout(() => {
        setMarkdownCopied(false)
      }, 2000)
    })
  }

  const onRepeatLastMessage = () => {
    const messageToRepeat = findAncestorUserMessage(
      selectedConversation?.messages ?? [],
      group.messages[0].id
    )
    if (messageToRepeat) {
      sendMessage?.({
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
                showAlerts={true}
                group={group}
              ></ChatMessageBody>
            )
          })}
        </div>
        {insertAssistantActionBar && (
          <div className="mt-2 ml-1 flex flex-row gap-1 items-center justify-start ">
            <SiblingSwitcher id={group.messages[0].id} siblings={group.siblings}></SiblingSwitcher>
            {group.siblings.length > 1 && <div>{`1/${group.siblings.length}`}</div>}
            {markdownCopied ? (
              <IconCheck size={20} className="text-green-500" />
            ) : (
              <button
                className={`${isLast ? 'visible' : 'invisible group-hover:visible'} focus:visible`}
                onClick={onClickCopyMarkdown}
              >
                <IconCopy size={20} className="opacity-50 hover:opacity-100" />
              </button>
            )}
            {textCopied ? (
              <IconCheck size={20} className="text-green-500" />
            ) : (
              <button
                className={`${isLast ? 'visible' : 'invisible group-hover:visible'} focus:visible`}
                onClick={onClickCopyText}
              >
                <IconCopyText size={20} className="opacity-50 hover:opacity-100" />
              </button>
            )}
            {isLast && sendMessage && (
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

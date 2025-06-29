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
import { MessageWithErrorExt, IMessageGroup, ToolCallMessageEx } from '@/lib/chat/types'
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
import { Attachment, ChatMessageBody } from './ChatMessage'

interface ChatMessageProps {
  assistant: dto.AssistantIdentification
  group: IMessageGroup
  isLast: boolean
}

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

export const AssistantMessageGroup: FC<ChatMessageProps> = ({ assistant, group, isLast }) => {
  const { t } = useTranslation()
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
                title={t('copy_as_text')}
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

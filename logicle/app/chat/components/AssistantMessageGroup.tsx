import { FC, memo, useContext, useEffect, useRef, useState } from 'react'

import React from 'react'
import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import ChatPageContext from './context'
import { stringToHslColor } from '@/components/ui/LetterAvatar'
import { IAssistantMessageGroup, IMessageGroup } from '@/lib/chat/types'
import { useTranslation } from 'react-i18next'
import { IconCheck, IconCopy, IconEdit, IconRepeat, IconTrash } from '@tabler/icons-react'
import { AssistantMessageMarkdown } from './AssistantMessageMarkdown'
import ReactDOM from 'react-dom/client'
import { SiblingSwitcher } from './SiblingSwitcher'
import { remark } from 'remark'
import strip from 'strip-markdown'
import { IconCopyText } from './icons'
import { AssistantGroupMessage } from './ChatMessage'
import { MessageError } from './ChatMessageError'
import { computeMarkdown } from './markdown/process'
import { delete_ } from '@/lib/fetch'
import toast from 'react-hot-toast'

interface Props {
  assistant: dto.AssistantIdentification
  group: IAssistantMessageGroup
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

export const AssistantMessageGroup: FC<Props> = ({ assistant, group, isLast }) => {
  const { t } = useTranslation()
  const avatarUrl = assistant.iconUri
  const avatarFallback = assistant.name
  const messageTitle = assistant.name
  const [markdownCopied, setMarkdownCopied] = useState(false)
  const [textCopied, setTextCopied] = useState(false)
  const fireEdit = useRef<() => void | null>(null)
  const {
    state: { chatStatus, selectedConversation },
    sendMessage,
  } = useContext(ChatPageContext)

  const insertAssistantActionBar = !isLast || chatStatus.state === 'idle'

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

  const handleEdit = () => {
    fireEdit.current?.()
  }

  const handleDelete = async () => {
    const firstInGroup = group.messages[0]
    const response = await delete_(
      `/api/conversations/${firstInGroup.conversationId}/messages/${firstInGroup.id}`
    )
    if (response.error) {
      toast.error(response.error.message)
      return
    }
  }

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
        <div className="w-full">
          {group.messages.map((message, index) => {
            return (
              <div key={message.id}>
                <AssistantGroupMessage
                  key={message.id}
                  message={message}
                  isLastMessage={isLast && index + 1 == group.messages.length}
                  fireEdit={fireEdit}
                ></AssistantGroupMessage>
                {message.error && (
                  <MessageError error={message.error} msgId={message.id}></MessageError>
                )}
              </div>
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
            {isLast && fireEdit.current && (
              <button onClick={() => handleEdit()}>
                <IconEdit size={20} className={`opacity-50 hover:opacity-100`} />
              </button>
            )}
            {isLast && (
              <button onClick={() => handleDelete()}>
                <IconTrash size={20} className={`opacity-50 hover:opacity-100`} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

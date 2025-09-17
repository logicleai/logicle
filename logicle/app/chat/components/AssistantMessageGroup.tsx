import { FC, useContext, useRef, useState } from 'react'

import * as dto from '@/types/dto'
import { Avatar } from '@/components/ui/avatar'
import ChatPageContext from './context'
import { stringToHslColor } from '@/components/ui/LetterAvatar'
import { IAssistantMessageGroup } from '@/lib/chat/types'
import { useTranslation } from 'react-i18next'
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconEdit,
  IconMarkdown,
  IconRepeat,
} from '@tabler/icons-react'
import { Markdown } from './Markdown'
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
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { getMessageAndDescendants } from '@/lib/chat/conversationUtils'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Button } from '@/components/ui/button'
import { downloadAsFile } from '@/lib/savefile'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuButton,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu'
import { unified } from 'unified'
import markdown from 'remark-parse'
import docx from 'remark-docx'

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
    if (msg.role === 'user') {
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
  const fireEdit = useRef<() => undefined | null>(null)
  const userPreferences: dto.UserPreferences = {
    ...dto.userPreferencesDefaults,
    ...(useUserProfile()?.preferences ?? {}),
  }
  const {
    state: { chatStatus, selectedConversation },
    sendMessage,
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const { setSideBarContent } = useContext(ChatPageContext)
  const insertActionBar = !isLast || chatStatus.state === 'idle'
  const modalContext = useConfirmationContext()
  const citations = group.messages.flatMap((m) => m.citations ?? [])
  const extractAssistantMarkdown = () => {
    return group.messages
      .filter((m) => m.role === 'assistant')
      .map((m) =>
        computeMarkdown(
          m.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join()
        )
      )
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
      <Markdown forExport={true} className="">
        {markdown}
      </Markdown>
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

  const onSaveMarkdown = () => {
    const markdown = extractAssistantMarkdown()
    downloadAsFile(new Blob([markdown], { type: 'text/plain' }), 'message.md')
  }

  const onSaveDocx = async () => {
    const extractedMarkdown = extractAssistantMarkdown()
    const processor = unified().use(markdown).use(docx, { output: 'blob' })
    const doc = await processor.process(extractedMarkdown)
    const blob = (await doc.result) as Blob
    downloadAsFile(blob, 'message.docx')
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
    if (!selectedConversation) {
      return
    }
    const result = await modalContext.askConfirmation({
      title: `${t('remove-message')}`,
      message: t('remove-message-confirmation'),
      confirmMsg: t('remove-message'),
    })
    if (!result) return
    const firstInGroup = group.messages[0]
    const idsToDelete = getMessageAndDescendants(
      group.messages[0].id,
      selectedConversation.messages
    ).map((m) => m.id)
    const response = await delete_(
      `/api/conversations/${firstInGroup.conversationId}/messages?ids=${idsToDelete.join(',')}`
    )
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    setSelectedConversation({
      ...selectedConversation,
      messages: selectedConversation.messages.filter((m) => !idsToDelete.includes(m.id)),
    })
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
                  isLastMessage={isLast && index + 1 === group.messages.length}
                  fireEdit={fireEdit}
                ></AssistantGroupMessage>
                {message.error && (
                  <MessageError error={message.error} msgId={message.id}></MessageError>
                )}
              </div>
            )
          })}
        </div>
        {citations.length > 0 && (
          <div>
            <Button
              variant="secondary"
              size="small"
              rounded="full"
              onClick={() =>
                setSideBarContent?.({
                  title: t('citations'),
                  type: 'citations',
                  citations: citations,
                })
              }
            >
              {t('sources')}
            </Button>
          </div>
        )}
        {insertActionBar && (
          <div className="flex justify-between">
            <div className="mt-2 ml-1 flex flex-row gap-1 items-center justify-start ">
              <SiblingSwitcher
                id={group.messages[0].id}
                siblings={group.siblings}
              ></SiblingSwitcher>
              {group.siblings.length > 1 && <div>{`1/${group.siblings.length}`}</div>}
              {markdownCopied ? (
                <IconCheck size={20} className="text-green-500" />
              ) : (
                <button
                  type="button"
                  title={t('copy_to_clipboard')}
                  className={`${
                    isLast ? 'visible' : 'invisible group-hover:visible'
                  } focus:visible`}
                  onClick={onClickCopyMarkdown}
                >
                  <IconCopy size={20} className="opacity-50 hover:opacity-100" />
                </button>
              )}
              {textCopied ? (
                <IconCheck size={20} className="text-green-500" />
              ) : (
                <button
                  type="button"
                  title={t('copy_as_text')}
                  className={`${
                    isLast ? 'visible' : 'invisible group-hover:visible'
                  } focus:visible`}
                  onClick={onClickCopyText}
                >
                  <IconCopyText size={20} className="opacity-50 hover:opacity-100" />
                </button>
              )}
              {isLast && sendMessage && (
                <button
                  type="button"
                  title={t('try_send_message_again')}
                  onClick={onRepeatLastMessage}
                >
                  <IconRepeat size={20} className={`opacity-50 hover:opacity-100`} />
                </button>
              )}
              {isLast && userPreferences.conversationEditing && fireEdit.current && (
                <button type="button" title={t('edit_message')} onClick={() => handleEdit()}>
                  <IconEdit size={20} className={`opacity-50 hover:opacity-100`} />
                </button>
              )}
            </div>
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex gap-1">
                  <IconDownload></IconDownload>
                  <span>{t('export')}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuButton icon={IconMarkdown} onClick={onSaveMarkdown}>
                    {t('markdown')}
                  </DropdownMenuButton>
                  <DropdownMenuButton icon={IconMarkdown} onClick={onSaveDocx}>
                    {t('docx')}
                  </DropdownMenuButton>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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
  IconFileTypeDocx,
  IconMarkdown,
  IconRepeat,
} from '@tabler/icons-react'
import { Markdown } from './Markdown'
import ReactDOM from 'react-dom/client'
import { SiblingSwitcher } from './SiblingSwitcher'
import { remark } from 'remark'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import strip from 'strip-markdown'
import { IconCopyText } from './icons'
import { AssistantGroupMessage } from './ChatMessage'
import { MessageError } from './ChatMessageError'
import { computeMarkdown } from './markdown/process'
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
import docx from 'remark-docx'
import { Upload } from '@/components/app/upload'
import remarkMath from 'remark-math'

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

async function blobToDataURL(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function inlineImages(rootEl: HTMLElement) {
  const imgs = Array.from(rootEl.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || src.startsWith('data:')) return
      try {
        // include credentials if your /api/files route requires cookies
        const res = await fetch(src, { credentials: 'include' })
        const blob = await res.blob()
        // Optional: preserve natural dimensions to keep layout after paste
        if (!img.getAttribute('width') && (img as any).naturalWidth) {
          img.setAttribute('width', String((img as any).naturalWidth))
        }
        if (!img.getAttribute('height') && (img as any).naturalHeight) {
          img.setAttribute('height', String((img as any).naturalHeight))
        }
        img.setAttribute('src', await blobToDataURL(blob))
      } catch (e) {
        // If fetch fails, you can remove the image or leave the original src
        console.warn('Failed to inline image', src, e)
      }
    })
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000 // process in chunks to avoid call stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
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
  } = useContext(ChatPageContext)

  const { setSideBarContent } = useContext(ChatPageContext)
  const insertActionBar = !isLast || chatStatus.state === 'idle'
  const citations = group.messages.flatMap((m) => m.citations ?? [])

  const convertToMarkdown = async (inlineImages: boolean = true) => {
    const markdownBlocks = await Promise.all(
      group.messages.map(async (m) => {
        if (m.role === 'assistant') {
          const text = m.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n\n') // use Markdown-friendly paragraph breaks

          return computeMarkdown(text)
        } else if (m.role === 'tool') {
          const files = m.parts
            .filter((p) => p.type === 'tool-result')
            .flatMap((p) => {
              if (p.result.type === 'content') {
                return p.result.value
              } else {
                return []
              }
            })
            .filter((f) => f.type === 'file')
          const buffers = await Promise.all(
            files.map(async (attachment) => {
              if (inlineImages) {
                const response = await fetch(`/api/files/${attachment.id}/content`)
                const b64 = arrayBufferToBase64(await response.arrayBuffer())
                return `![${attachment.name || 'image'}](data:${attachment.mimetype};base64,${b64})`
              } else {
                return `![${attachment.name || 'image'}](/api/files/${attachment.id}/content)`
              }
            })
          )
          return buffers.join('\n\n')
        }
        return null
      })
    )
    return markdownBlocks.filter((b) => b != null).join('\n\n')
  }

  const convertToHtml = () => {
    const container = document.createElement('div')
    container.style.position = 'absolute'
    container.style.visibility = 'hidden'
    document.body.appendChild(container)
    const root = ReactDOM.createRoot(container)
    root.render(
      group.messages.map((m) => {
        if (m.role === 'assistant') {
          return m.parts
            .filter((part) => part.type === 'text')
            .map((part, index) => (
              <Markdown key={index} forExport={true} className="">
                {part.text}
              </Markdown>
            ))
        } else if (m.role === 'tool') {
          const files = m.parts
            .filter((p) => p.type === 'tool-result')
            .flatMap((p) => {
              if (p.result.type === 'content') {
                return p.result.value
              } else {
                return []
              }
            })
            .filter((f) => f.type === 'file')

          return files.map((attachment) => {
            const upload: Upload = {
              progress: 1,
              fileId: attachment.id,
              fileName: attachment.name,
              fileSize: attachment.size,
              fileType: attachment.mimetype,
              done: true,
            }
            return (
              <img key={upload.fileId} alt="" src={`/api/files/${upload.fileId}/content`}></img>
            )
          })
        } else {
          return null
        }
      })
    )
    return new Promise<string>((resolve, reject) => {
      requestAnimationFrame(async () => {
        try {
          await inlineImages(container)
          resolve(container.innerHTML)
        } catch (err) {
          reject(err)
        } finally {
          root.unmount()
          document.body.removeChild(container)
        }
      })
    })
  }

  const onClickCopyText = async () => {
    if (!navigator.clipboard) return
    const text = String(
      await remark()
        .use(strip)
        .process(await convertToMarkdown())
    )
    await navigator.clipboard.writeText(text).then(() => {
      setTextCopied(true)
      setTimeout(() => {
        setTextCopied(false)
      }, 2000)
    })
  }

  const onClickCopy = async () => {
    if (!navigator.clipboard) return

    // 3️⃣ After next paint, grab HTML, copy, cleanup
    setMarkdownCopied(true)
    const html = await convertToHtml()

    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([await convertToMarkdown(false)], { type: 'text/plain' }),
      }),
    ])
    setTimeout(() => {
      setMarkdownCopied(false)
    }, 2000)
  }

  const onSaveMarkdown = async () => {
    const markdown = await convertToMarkdown()
    downloadAsFile(new Blob([markdown], { type: 'text/plain' }), 'message.md')
  }

  const onSaveDocx = async () => {
    const extractedMarkdown = await convertToMarkdown(false)
    async function resolver(url: string) {
      const response = await fetch(url)
      return {
        image: await response.arrayBuffer(),
        width: 512,
        height: 512,
      }
    }
    const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(docx, {
      output: 'blob',
      imageResolver: resolver,
    })
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
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  title={t('copy_to_clipboard')}
                  className={`${
                    isLast ? 'visible' : 'invisible group-hover:visible'
                  } focus:visible`}
                  onClick={onClickCopy}
                >
                  <IconCopy size={20} className="opacity-50 hover:opacity-100" />
                </Button>
              )}
              {textCopied ? (
                <IconCheck size={20} className="text-green-500" />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  title={t('copy_as_text')}
                  className={`${
                    isLast ? 'visible' : 'invisible group-hover:visible'
                  } focus:visible`}
                  onClick={onClickCopyText}
                >
                  <IconCopyText
                    size={20}
                    className="opacity-50 hover:opacity-100"
                    title={t('copy_as_text')}
                    textLetter={t('text-letter')}
                  />
                </Button>
              )}
              {isLast && sendMessage && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  title={t('try_send_message_again')}
                  onClick={onRepeatLastMessage}
                >
                  <IconRepeat size={20} className={`opacity-50 hover:opacity-100`} />
                </Button>
              )}
              {isLast && userPreferences.conversationEditing && fireEdit.current && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  title={t('edit_message')}
                  onClick={() => handleEdit()}
                >
                  <IconEdit size={20} className={`opacity-50 hover:opacity-100`} />
                </Button>
              )}
            </div>
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="flex gap-1 opacity-50 hover:opacity-100">
                  <Button variant="ghost" size="icon">
                    <IconDownload></IconDownload>
                    <span>{t('export')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuButton icon={IconMarkdown} onClick={onSaveMarkdown}>
                    {t('markdown')}
                  </DropdownMenuButton>
                  <DropdownMenuButton icon={IconFileTypeDocx} onClick={onSaveDocx}>
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

'use client'
import { useContext, useEffect, useRef, useState } from 'react'

import ChatPageContext, { SideBarContent } from '@/app/chat/components/context'
import { ChatInput } from './ChatInput'
import { flatten, groupMessages } from '@/lib/chat/conversationUtils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconArrowDown, IconX } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { ChatMessage } from './ChatMessage'
import { useChatInput } from '@/components/providers/localstoragechatstate'
import { nanoid } from 'nanoid'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

const Citation = ({ citation: citation_ }: { citation: dto.Citation }) => {
  const citation =
    typeof citation_ == 'string'
      ? {
          title: '',
          summary: '',
          url: citation_,
        }
      : citation_
  const parsedUrl = new URL(citation.url)
  const protocol = parsedUrl.protocol
  const fqdn = parsedUrl.hostname // e.g. "www.example.com"

  return (
    <div
      className="flex flex-col gap-2"
      onClick={() => {
        window.open(citation.url, '_blank', 'noopener,noreferrer')
      }}
    >
      <div className="flex items-center gap-2">
        <img src={`https://www.google.com/s2/favicons?domain=${protocol}//${fqdn}`}></img>
        <span>{fqdn}</span>
      </div>
      <span className="font-bold">{citation.title}</span>
      <span>{citation.summary}</span>
    </div>
  )
}

const Sidebar = ({ content, className }: { content: SideBarContent; className?: string }) => {
  const { t } = useTranslation()
  const { setSideBarContent } = useContext(ChatPageContext)
  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      <div className="flex">
        <div className="flex-1 text-h3 border-b-2 border-b-gray-200">{t('citations')}</div>
        <Button variant="ghost" onClick={() => setSideBarContent?.(undefined)}>
          <IconX></IconX>
        </Button>
      </div>
      <ScrollArea className="w-[400px] flex-1">
        <div className="flex flex-col gap-4">
          {content.map((c) => {
            return <Citation key={nanoid()} citation={c}></Citation>
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

export interface ChatProps {
  assistant: dto.AssistantIdentification
  supportedMedia: string[]
  className?: string
}

export const Chat = ({ assistant, className, supportedMedia }: ChatProps) => {
  const {
    state: { selectedConversation, chatStatus, sideBarContent },
    sendMessage,
    setSideBarContent,
  } = useContext(ChatPageContext)

  const { t } = useTranslation()
  const [chatInput, setChatInput] = useChatInput(selectedConversation?.id ?? '')
  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true)
  const [showScrollDownButton, setShowScrollDownButton] = useState<boolean>(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setSideBarContent?.(undefined)
  }, [])
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
      const bottomTolerance = 30
      if (scrollTop + clientHeight < scrollHeight - bottomTolerance) {
        setAutoScrollEnabled(false)
        setShowScrollDownButton(true)
      } else {
        setAutoScrollEnabled(true)
        setShowScrollDownButton(false)
      }
    }
  }

  const handleScrollDown = () => {
    chatContainerRef.current?.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }

  const scrollDown = () => {
    if (autoScrollEnabled) {
      messagesEndRef.current?.scrollIntoView()
    }
  }
  const throttledScrollDown = throttle(scrollDown, 250)

  useEffect(() => {
    throttledScrollDown()
  }, [selectedConversation, throttledScrollDown, chatStatus])

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          textareaRef.current?.focus()
        }
      },
      {
        root: null,
        threshold: 0.5,
      }
    )
    const messagesEndElement = messagesEndRef.current
    if (messagesEndElement) {
      observer.observe(messagesEndElement)
    }
    return () => {
      if (messagesEndElement) {
        observer.unobserve(messagesEndElement)
      }
    }
  }, [messagesEndRef])

  if (!selectedConversation) {
    return <></>
  }
  const groupList = groupMessages(flatten(selectedConversation.messages))
  return (
    <div className={`flex overflow-hidden gap-4 ${className ?? ''}`}>
      <div className={`flex flex-1 flex-col overflow-hidden`}>
        <ScrollArea
          className="max-h-full flex-1 overflow-x-hidden relative"
          ref={chatContainerRef}
          onScroll={handleScroll}
        >
          <div className="max-w-[var(--thread-content-max-width)] mx-auto">
            {groupList.map((group, index) => (
              <ChatMessage
                key={index}
                assistant={assistant}
                group={group}
                isLast={index + 1 == groupList.length}
              />
            ))}
            <div className="h-[1px]" ref={messagesEndRef} />
          </div>
          {showScrollDownButton && (
            <div className="absolute bottom-4 right-1/2">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-foreground shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={handleScrollDown}
              >
                <IconArrowDown size={18} />
              </button>
            </div>
          )}
        </ScrollArea>
        <ChatInput
          chatInput={chatInput}
          setChatInput={setChatInput}
          onSend={({ content, attachments }) => {
            setAutoScrollEnabled(true)
            messagesEndRef.current?.scrollIntoView()
            sendMessage?.({
              msg: { role: 'user', content, attachments },
            })
          }}
          supportedMedia={supportedMedia}
        />
      </div>
      {sideBarContent && <Sidebar content={sideBarContent} />}
    </div>
  )
}
Chat.displayName = 'Chat'

function throttle<T extends (...args: unknown[]) => unknown>(func: T, limit: number): T {
  let lastFunc: ReturnType<typeof setTimeout>
  let lastRan: number

  return ((...args) => {
    if (!lastRan) {
      func(...args)
      lastRan = Date.now()
    } else {
      clearTimeout(lastFunc)
      lastFunc = setTimeout(
        () => {
          if (Date.now() - lastRan >= limit) {
            func(...args)
            lastRan = Date.now()
          }
        },
        limit - (Date.now() - lastRan)
      )
    }
  }) as T
}

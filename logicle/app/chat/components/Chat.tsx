'use client'
import { useContext, useEffect, useRef, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { ChatInputOrApiKey } from './ChatInputOrApiKey'
import { ChatDisclaimer } from './ChatDisclaimer'
import { groupMessages } from '@/lib/chat/conversationUtils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconArrowDown } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { useChatInput } from '@/components/providers/localstoragechatstate'
import { MessageGroup } from './MessageGroup'
import { ConversationSidebar } from './ConversationSidebar'
import { useTranslation } from 'react-i18next'

export interface ChatProps {
  assistant: dto.AssistantIdentification & {
    usability: dto.AssistantUsability
  }
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
    return null
  }
  let streamingPart: dto.MessagePart | undefined
  if (chatStatus.state === 'receiving' && selectedConversation.messages.length) {
    const lastMessage = selectedConversation.messages[selectedConversation.messages.length - 1]
    if (lastMessage.role === 'assistant' || lastMessage.role === 'tool') {
      if (lastMessage.parts.length) {
        streamingPart = lastMessage.parts[lastMessage.parts.length - 1]
      }
    }
  }
  const groupList = groupMessages(
    selectedConversation.messages,
    selectedConversation.targetLeaf,
    streamingPart
  )
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
              <MessageGroup
                key={index}
                assistant={assistant}
                group={group}
                isLast={index + 1 === groupList.length}
              />
            ))}
            <div className="h-[1px]" ref={messagesEndRef} />
          </div>
          {showScrollDownButton && (
            <div className="absolute bottom-4 right-1/2">
              <button
                type="button"
                title={t('scroll_to_end_of_conversation')}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-foreground shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={handleScrollDown}
              >
                <IconArrowDown size={18} />
              </button>
            </div>
          )}
        </ScrollArea>
        <ChatInputOrApiKey
          assistant={assistant}
          chatInput={chatInput}
          setChatInput={setChatInput}
          supportedMedia={supportedMedia}
          onSend={({ content, attachments }) => {
            setAutoScrollEnabled(true)
            messagesEndRef.current?.scrollIntoView()
            sendMessage?.({
              msg: { role: 'user', content, attachments },
            })
          }}
        />
        <ChatDisclaimer />
      </div>
      {sideBarContent && <ConversationSidebar content={sideBarContent} />}
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

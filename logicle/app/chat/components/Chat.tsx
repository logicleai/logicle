import { useContext, useEffect, useRef, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { ChatInput } from './ChatInput'
import { MemoizedChatMessage } from './MemoizedChatMessage'
import { flatten } from '@/lib/chat/conversationUtils'
import { UserAssistant } from '@/types/chat'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconArrowDown } from '@tabler/icons-react'

export interface ChatProps {
  assistant: UserAssistant
  className?: string
}

export const Chat = ({ assistant, className }: ChatProps) => {
  const {
    state: { selectedConversation },
    handleSend,
  } = useContext(ChatPageContext)

  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true)
  const [showScrollDownButton, setShowScrollDownButton] = useState<boolean>(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      messagesEndRef.current?.scrollIntoView(true)
    }
  }
  const throttledScrollDown = throttle(scrollDown, 250)

  useEffect(() => {
    throttledScrollDown()
  }, [selectedConversation, throttledScrollDown])

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setAutoScrollEnabled(entry.isIntersecting)
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
  const assistantImageUrl = assistant.icon ? `/api/images/${assistant.icon}` : undefined

  return (
    <div className={`flex flex-col overflow-hidden ${className ?? ''}`}>
      <ScrollArea
        className="max-h-full flex-1 overflow-x-hidden relative"
        ref={chatContainerRef}
        onScroll={handleScroll}
      >
        <div className="max-w-[700px] mx-auto">
          {flatten(selectedConversation).messages.map((message, index) => (
            <MemoizedChatMessage
              key={index}
              assistant={assistant}
              assistantImageUrl={assistantImageUrl}
              message={message}
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
      <ChatInput onSend={handleSend} />
    </div>
  )
}
Chat.displayName = 'Chat'

function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
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

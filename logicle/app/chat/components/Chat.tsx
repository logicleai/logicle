import { useContext, useEffect, useRef, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'
import { ChatInput } from './ChatInput'
import { flatten, groupMessages } from '@/lib/chat/conversationUtils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconArrowDown } from '@tabler/icons-react'
import * as dto from '@/types/dto'
import { ChatMessage } from './ChatMessage'

export interface ChatProps {
  assistant: dto.AssistantIdentification
  className?: string
}

export const Chat = ({ assistant, className }: ChatProps) => {
  const {
    state: { selectedConversation, chatStatus },
    sendMessage,
  } = useContext(ChatPageContext)

  const [chatInput, setChatInput] = useState<string>('')
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
    <div className={`flex flex-col overflow-hidden ${className ?? ''}`}>
      <ScrollArea
        className="max-h-full flex-1 overflow-x-hidden relative"
        ref={chatContainerRef}
        onScroll={handleScroll}
      >
        <div className="max-w-[700px] mx-auto">
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
      />
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

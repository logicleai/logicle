import { IconCheck, IconCopy, IconRepeat } from '@tabler/icons-react'
import { FC, useContext, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'

import { CodeBlock } from './markdown/CodeBlock'
import { MemoizedReactMarkdown } from './markdown/MemoizedReactMarkdown'

import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import React from 'react'
import rehypeMathjax from 'rehype-mathjax/browser'
import * as dto from '@/types/dto'

interface Props {
  message: dto.Message
}

export const AssistantMessage: FC<Props> = ({ message }) => {
  const [messagedCopied, setMessageCopied] = useState(false)
  const {
    state: { chatStatus, selectedConversation },
    handleSend,
  } = useContext(ChatPageContext)

  const onClickCopy = () => {
    if (!navigator.clipboard) return

    navigator.clipboard.writeText(message.content).then(() => {
      setMessageCopied(true)
      setTimeout(() => {
        setMessageCopied(false)
      }, 2000)
    })
  }

  const onRepeatLastMessage = () => {
    const parentMsg = selectedConversation?.messages.find((msg) => msg.id == message.parent)
    if (parentMsg) {
      handleSend(parentMsg.content, [], parentMsg)
    }
  }

  let className = 'prose flex-1'
  if (chatStatus.state == 'receiving' && chatStatus.messageId === message.id) {
    className += ' result-streaming'
  }
  const messages = selectedConversation?.messages
  const canRegenerate =
    chatStatus.state === 'idle' &&
    messages &&
    messages.length > 0 &&
    messages[messages.length - 1].id == message.id
  return (
    <div className="flex flex-col">
      {message.content.length == 0 ? (
        <div className={className}>
          <p></p>
        </div>
      ) : (
        <MemoizedReactMarkdown
          className={className}
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeMathjax]}
          components={{
            code({ className, children, ...props }) {
              // Luca: there was some logic here about inline which I really could not follow (and compiler was complaining)
              // what happens here is that we're using SyntaxHighlighter
              // when we encounter a code block
              // More info here: https://github.com/remarkjs/react-markdown
              const match = /language-(\w+)/.exec(className || '')
              return match ? (
                <CodeBlock
                  key={Math.random()}
                  language={match[1]}
                  value={String(children).replace(/\n$/, '')}
                  {...props}
                />
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            },
            table({ children }) {
              return (
                <table className="border-collapse border px-3 py-1 border-foreground">
                  {children}
                </table>
              )
            },
            th({ children }) {
              return <th className="break-words border px-3 py-1 border-foreground">{children}</th>
            },
            td({ children }) {
              return <td className="break-words border px-3 py-1 border-foreground">{children}</td>
            },
          }}
        >
          {`${message.content} `}
        </MemoizedReactMarkdown>
      )}
      <div className="mt-2 md:-mr-8 ml-1 md:ml-0 flex flex-col md:flex-row gap-4 md:gap-1 items-center md:items-start justify-end md:justify-start">
        {messagedCopied ? (
          <IconCheck size={20} className="text-green-500" />
        ) : (
          <button className="invisible group-hover:visible focus:visible" onClick={onClickCopy}>
            <IconCopy size={20} className="opacity-50 hover:opacity-100" />
          </button>
        )}
        {canRegenerate && (
          <button
            className="invisible group-hover:visible focus:visible"
            onClick={onRepeatLastMessage}
          >
            <IconRepeat size={20} className="opacity-50 hover:opacity-100" />
          </button>
        )}
      </div>
    </div>
  )
}

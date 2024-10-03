import { IconCheck, IconCopy, IconRepeat } from '@tabler/icons-react'
import { FC, useContext, useState } from 'react'

import ChatPageContext from '@/app/chat/components/context'

import { CodeBlock } from './markdown/CodeBlock'

import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import React from 'react'
import * as dto from '@/types/dto'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you

interface Props {
  message: dto.Message
  isLast: boolean
}

function convertMathToKatexSyntax(text: string) {
  const pattern = /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g
  const res = text.replace(pattern, (match, codeBlock, squareBracket, roundBracket) => {
    if (codeBlock) {
      return codeBlock
    } else if (squareBracket) {
      return `$$${squareBracket}$$`
    } else if (roundBracket) {
      return `$${roundBracket}$`
    }
    return match
  })
  return res
}

export const AssistantMessage: FC<Props> = ({ message, isLast }) => {
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

  const findAncestorUserMessage = (msgId: string) => {
    if (!selectedConversation) return undefined
    const idToMessage = Object.fromEntries(selectedConversation.messages.map((m) => [m.id, m]))
    let msg = idToMessage[msgId]
    while (msg) {
      if (msg.role == 'user' && !msg.toolCallAuthResponse) {
        return msg
      }
      if (!msg.parent) break
      msg = idToMessage[msg.parent]
    }
    return undefined
  }
  const onRepeatLastMessage = () => {
    const messageToRepeat = findAncestorUserMessage(message.id)
    if (messageToRepeat) {
      handleSend({
        content: messageToRepeat.content,
        attachments: messageToRepeat.attachments,
        repeating: messageToRepeat,
      })
    }
  }

  let className = 'prose flex-1 relative'
  if (chatStatus.state == 'receiving' && chatStatus.messageId === message.id) {
    className += ' result-streaming'
  }

  // The action bar is not even inserted for last element
  const insertActionBar = !isLast || chatStatus.state === 'idle'
  return (
    <div className="flex flex-col relative">
      {message.content.length == 0 ? (
        <div className={className}>
          <p></p>
        </div>
      ) : (
        <ReactMarkdown
          className={className}
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
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
          {convertMathToKatexSyntax(message.content)}
        </ReactMarkdown>
      )}
      {insertActionBar && (
        <div className="mt-2 md:-mr-8 ml-1 md:ml-0 flex flex-col md:flex-row gap-4 md:gap-1 items-center md:items-start justify-end md:justify-start">
          {messagedCopied ? (
            <IconCheck size={20} className="text-green-500" />
          ) : (
            <button
              className={`${isLast ? 'visible' : 'invisible group-hover:visible'} focus:visible`}
              onClick={onClickCopy}
            >
              <IconCopy size={20} className="opacity-50 hover:opacity-100" />
            </button>
          )}
          {isLast && (
            <button onClick={onRepeatLastMessage}>
              <IconRepeat size={20} className={`opacity-50 hover:opacity-100`} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

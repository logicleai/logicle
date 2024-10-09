import { FC, memo, useContext, useState } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import { CodeBlock } from './markdown/CodeBlock'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import React from 'react'
import * as dto from '@/types/dto'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you
import ReactMarkdown, { Options } from 'react-markdown'

interface Props {
  message: dto.Message
  isLast: boolean
}

export const MemoizedReactMarkdown: FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && prevProps.className === nextProps.className
)

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

  let className = 'prose flex-1 relative'
  if (chatStatus.state == 'receiving' && chatStatus.messageId === message.id) {
    className += ' result-streaming'
  }

  return (
    <div className="flex flex-col relative">
      {message.content.length == 0 ? (
        <div className={className}>
          <p></p>
        </div>
      ) : (
        <MemoizedReactMarkdown
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
        </MemoizedReactMarkdown>
      )}
    </div>
  )
}

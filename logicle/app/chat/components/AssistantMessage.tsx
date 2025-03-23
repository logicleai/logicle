import { FC, memo, ReactElement, ReactNode, useContext, useMemo } from 'react'
import ChatPageContext from '@/app/chat/components/context'
import { CodeBlock } from './markdown/CodeBlock'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import React from 'react'
import * as dto from '@/types/dto'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you
import ReactMarkdown, { Options } from 'react-markdown'
import { Attachment } from './ChatMessage'
import { Plugin } from 'unified'
import { Upload } from '@/components/app/upload'
import { visit } from 'unist-util-visit'
import { Root } from 'mdast'

interface Props {
  message: dto.BaseMessage
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      citation: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
      followup: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
const allowedElements = ['<citation>', '</citation>', '<followup>', '</followup>']

// Define the custom plugin as a TypeScript function
const filterNodes: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node, index, parent) => {
      if (node.type === 'html' && !allowedElements.includes(node.value)) {
        if (parent && typeof index === 'number') {
          console.log(`Removing node ${node.value}`)
          parent.children.splice(index, 1) // Remove the node
        }
      }
    })
  }
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

function expandCitations(text: string, citations: string[]): string {
  return text.replace(/\[(\d+)\]/g, (match, numStr) => {
    const num = parseInt(numStr, 10)
    if (num > 0 && num <= citations.length) {
      return `<citation>[${numStr}](${citations[num - 1]})</citation>`
    } else {
      return `[${numStr}]`
    }
  })
}

function processMarkdown(msg: dto.BaseMessage) {
  let text = convertMathToKatexSyntax(msg.content)
  if (msg.citations) {
    text = expandCitations(text, msg.citations)
  }
  return text
}

function extractTextFromChildren(children: ReactNode) {
  let text = ''

  React.Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      text += child
    } else if (React.isValidElement(child)) {
      text += extractTextFromChildren(child.props.children)
    }
  })

  return text
}

const FollowUpComponent: React.FC<{ children: string }> = ({ children }) => {
  const {
    sendMessage,
    state: { chatStatus },
  } = useContext(ChatPageContext)
  return (
    <span
      className="italic"
      onClick={() => {
        if (chatStatus.state == 'idle') sendMessage?.({ msg: { role: 'user', content: children } })
      }}
    >
      <li className="cursor-pointer">{children}</li>
    </span>
  )
}

export const AssistantMessage: FC<Props> = ({ message }) => {
  const {
    state: { chatStatus },
  } = useContext(ChatPageContext)

  let className = 'prose flex-1 relative'
  if (chatStatus.state == 'receiving' && chatStatus.messageId === message.id) {
    className += ' result-streaming'
  }

  const processedMarkdown = useMemo(
    () => processMarkdown(message),
    [message.content, message.citations]
  )

  return (
    <div className="flex flex-col relative">
      {message.attachments.map((attachment) => {
        const upload: Upload = {
          progress: 1,
          fileId: attachment.id,
          fileName: attachment.name,
          fileSize: attachment.size,
          fileType: attachment.mimetype,
          done: true,
        }
        return <Attachment key={attachment.id} file={upload}></Attachment>
      })}
      {message.reasoning && <p>{`Reasoning: ${message.reasoning}`}</p>}

      {message.content.length == 0 ? (
        <div className={className}>
          <p></p>
        </div>
      ) : (
        <MemoizedReactMarkdown
          className={className}
          remarkPlugins={[remarkGfm, remarkMath, [filterNodes]]}
          rehypePlugins={[rehypeKatex, rehypeRaw]}
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
            citation({ children }) {
              return (
                <span className=" ">
                  {React.Children.map(children, (child) =>
                    React.isValidElement(child) && child.type === 'a'
                      ? React.cloneElement(child as ReactElement, {
                          className:
                            'mx-0.5 bg-muted hover:bg-primary_color_hover text-sm px-1 hover:bg-primary_color_hover no-underline',
                          target: '_blank',
                          rel: 'noopener noreferrer',
                        })
                      : child
                  )}
                </span>
              )
            },
            followup({ children }) {
              return <FollowUpComponent>{extractTextFromChildren(children)}</FollowUpComponent>
            },
          }}
        >
          {processedMarkdown}
        </MemoizedReactMarkdown>
      )}
    </div>
  )
}

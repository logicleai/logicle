import { CodeBlock } from './markdown/CodeBlock'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import ReactMarkdown from 'react-markdown'
import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you
import React, { memo } from 'react'

import { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { Root, Node } from 'mdast'

const allowedElements = ['<citation>', '</citation>']

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

export function remarkAddBlockCodeFlag() {
  return (tree: Node) => {
    visit(tree, 'code', (node: Node) => {
      // Check if the parent is an element with tagName "pre"
      node.data = node.data || {}
      node.data.hProperties = node.data.hProperties || {}
      node.data.hProperties.isBlockCode = 'true'
    })
  }
}

export const AssistantMessageMarkdown: React.FC<{
  className: string
  children: string
  forExport?: boolean
}> = ({ className, children: markdown, forExport }) => {
  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm, remarkMath, [filterNodes], [remarkAddBlockCodeFlag]]}
      rehypePlugins={[rehypeKatex, rehypeRaw]}
      components={{
        code({ node, className, children, ...props }) {
          // We want to use SyntaxHighligher only for code blocks, i.e. ```{body}```
          // The only reasonable way of distinguish from inline code blocks is working
          // with mdast tree, with a custom plugin which adds a property "isBlockCode"
          const isBlockCode = (node as any)?.properties?.isBlockCode
          if (isBlockCode) {
            const match = /language-(\w+)/.exec(className || '')
            return (
              <CodeBlock
                key={Math.random()}
                language={match ? match[1] : ''}
                value={String(children).replace(/\n$/, '')}
                forExport={forExport}
                {...props}
              />
            )
          } else {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          }
        },
        table({ children }) {
          return (
            <table className="border-collapse border px-3 py-1 border-foreground">{children}</table>
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
                  ? React.cloneElement(child as React.ReactElement, {
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
      }}
    >
      {markdown}
    </ReactMarkdown>
  )
}

export const MemoizedAssistantMessageMarkdown: React.FC<{ className: string; children: string }> =
  memo(
    AssistantMessageMarkdown,
    (prevProps, nextProps) =>
      prevProps.children === nextProps.children && prevProps.className === nextProps.className
  )

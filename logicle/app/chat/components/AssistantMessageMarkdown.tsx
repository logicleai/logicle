import { CodeBlock } from './markdown/CodeBlock'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import ReactMarkdown from 'react-markdown'
import rehypeExternalLinks from 'rehype-external-links'
import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you
import React, { memo } from 'react'

import { visit } from 'unist-util-visit'
import { Node } from 'mdast'
import { MermaidDiagram } from '@lightenna/react-mermaid-diagram'

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

type AnchorProps = React.ComponentPropsWithoutRef<'a'>

const CustomAnchor = ({ children, href, className, ...rest }: AnchorProps) => {
  // Extract text from children
  const textContent = React.Children.toArray(children)
    .filter((child) => typeof child === 'string')
    .join('')
  const bracketNumberRegex = /^\d+$/
  // Test if textContent matches “[number]”
  const isBracketNumber = bracketNumberRegex.test(textContent)
  return (
    <a
      href={href}
      className={
        isBracketNumber
          ? 'mx-0.5 bg-muted hover:bg-primary_color_hover text-sm px-1 hover:bg-primary_color_hover no-underline'
          : className
      }
      {...rest}
    >
      {children}
    </a>
  )
}

export const AssistantMessageMarkdown: React.FC<{
  className: string
  children: string
  forExport?: boolean
}> = ({ className, children: markdown, forExport }) => {
  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm, remarkMath, [remarkAddBlockCodeFlag]]}
      rehypePlugins={[
        [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
        rehypeKatex,
        rehypeRaw,
      ]}
      components={{
        code({ node, className, children, ...props }) {
          // We want to use SyntaxHighligher only for code blocks, i.e. ```{body}```
          // The only reasonable way of distinguish from inline code blocks is working
          // with mdast tree, with a custom plugin which adds a property "isBlockCode"
          const isBlockCode = (node as any)?.properties?.isBlockCode
          if (isBlockCode) {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : undefined
            if (language == 'mermaid') {
              return <MermaidDiagram className="bg-white">{String(children)}</MermaidDiagram>
            } else {
              return (
                <CodeBlock
                  key={Math.random()}
                  language={language}
                  value={String(children).replace(/\n$/, '')}
                  forExport={forExport}
                  {...props}
                />
              )
            }
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
            <div className="px-2 py-2 overflow-x-auto">
              <table className="border-collapse border-foreground mt-0.5 mb-0.5">{children}</table>
            </div>
          )
        },
        th({ children }) {
          return <th className="break-words border px-3 py-1 border-foreground">{children}</th>
        },
        td({ children }) {
          return <td className="break-words border px-3 py-1 border-foreground">{children}</td>
        },
        a({ children, ...props }) {
          return <CustomAnchor {...props}>{children}</CustomAnchor>
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

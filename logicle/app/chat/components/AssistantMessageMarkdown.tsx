import { CodeBlock } from './markdown/CodeBlock'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import ReactMarkdown, { Components } from 'react-markdown'
import rehypeExternalLinks from 'rehype-external-links'
import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you
import React, { memo, MutableRefObject } from 'react'

import { visit } from 'unist-util-visit'
import { Node } from 'mdast'
import { MermaidDiagram } from './MermaidDiagram'

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
          ? 'mx-0.5 bg-muted hover:bg-primary-hover text-sm px-1 no-underline'
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
  ref?: MutableRefObject<HTMLDivElement | null>
  forExport?: boolean
}> = ({ className, children: markdown, ref, forExport }) => {
  // This use memo is important. I'm not sure I got why, but id reduces renders on
  // The mermaid component
  const components: Components = React.useMemo(
    () => ({
      pre({ children, ...props }) {
        const onlyChild = React.Children.only(children)
        if (
          React.isValidElement(onlyChild) &&
          (onlyChild as any).props.className === 'language-mermaid'
        ) {
          return onlyChild
        }
        return <pre {...props}>{children}</pre>
      },
      code({ node, className, children, ...props }) {
        const isBlockCode = node?.properties?.isBlockCode
        if (isBlockCode) {
          const match = /language-(\w+)/.exec(className || '')
          const language = match ? match[1] : undefined
          if (language === 'mermaid') {
            return (
              <MermaidDiagram className="bg-white" {...props}>
                {String(children)}
              </MermaidDiagram>
            )
          } else {
            return (
              <CodeBlock
                language={language}
                value={String(children).replace(/\n$/, '')}
                forExport={forExport}
                {...props}
              />
            )
          }
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      },
      table({ children }) {
        return (
          <div className="px-2 py-2 overflow-x-auto">
            <table className="mt-0.5 mb-0.5 table-striped">{children}</table>
          </div>
        )
      },
      th({ children }) {
        return <th className="break-words px-3 py-1">{children}</th>
      },
      td({ children }) {
        return <td className="break-words px-3 py-1">{children}</td>
      },
      a({ children, ...props }) {
        return <CustomAnchor {...props}>{children}</CustomAnchor>
      },
    }),
    [forExport]
  )

  return (
    <div ref={ref}>
      <ReactMarkdown
        className={className}
        remarkPlugins={[remarkGfm, remarkMath, [remarkAddBlockCodeFlag]]}
        rehypePlugins={[
          [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
          rehypeKatex,
          rehypeRaw,
        ]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

export const MemoizedAssistantMessageMarkdown: React.FC<{
  className: string
  children: string
  ref?: MutableRefObject<HTMLDivElement | null>
}> = memo(
  AssistantMessageMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && prevProps.className === nextProps.className
)

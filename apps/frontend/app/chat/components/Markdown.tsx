import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import ReactMarkdown, { Components } from 'react-markdown'
import rehypeExternalLinks from 'rehype-external-links'
import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you
import React, { memo, MutableRefObject, Suspense } from 'react'

import { visit } from 'unist-util-visit'
import type { Root, Code } from 'mdast'
import type { Element, Root as HastRoot } from 'hast'
import { Table } from './Table'

// Lazy: `react-syntax-highlighter`'s Prism build bundles ~250 language
// grammars, and `mermaid` (diagram rendering) is its own multi-hundred-KB
// dependency tree — together the single largest chunk in the app by far,
// yet most messages contain neither. Deferring both to first actual use
// keeps that weight out of every /chat page load.
const CodeBlock = React.lazy(() =>
  import('./markdown/CodeBlock').then((m) => ({ default: m.CodeBlock }))
)
const MermaidDiagram = React.lazy(() =>
  import('./MermaidDiagram').then((m) => ({ default: m.MermaidDiagram }))
)

// Inline styles from assistant output are allowed broadly — the product
// deliberately supports rich HTML formatting — with two carve-outs that keep
// the surface safe without an ever-growing property allowlist:
//
//  1. Properties that let an element escape the message flow and overlay the
//     rest of the page (clickjacking) are dropped.
//  2. Any value that can trigger a network fetch or code execution is dropped:
//     `url(...)`, `image-set(...)`, `expression(...)`, `@import`, `javascript:`.
//     This is the cheap equivalent of "strip attributes that carry URLs" —
//     `background-image`, `list-style-image`, `cursor`, `content`, `mask`, …
//     all funnel through `url()`, so one value check covers them.
const blockedStyleProperties = new Set([
  'position',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'transform',
  'pointer-events',
])

const unsafeStyleValue = /url\(|image-set\(|expression\(|@import|javascript:|[<>]/i

const sanitizeInlineStyle = (style: string) =>
  style
    .split(';')
    .map((declaration) => {
      const separator = declaration.indexOf(':')
      if (separator === -1) return undefined
      const property = declaration.slice(0, separator).trim().toLowerCase()
      const value = declaration.slice(separator + 1).trim()
      if (!property || !value) return undefined
      if (property.startsWith('--')) return undefined
      if (blockedStyleProperties.has(property)) return undefined
      if (unsafeStyleValue.test(value)) return undefined
      return `${property}: ${value}`
    })
    .filter((declaration): declaration is string => declaration !== undefined)
    .join('; ')

export function rehypeFilterInlineStyles() {
  return (tree: HastRoot) => {
    visit(tree, 'element', (node: Element) => {
      const style = node.properties.style
      if (typeof style !== 'string') return
      const sanitizedStyle = sanitizeInlineStyle(style)
      if (sanitizedStyle) {
        node.properties.style = sanitizedStyle
      } else {
        delete node.properties.style
      }
    })
  }
}

export const markdownSanitizeSchema = {
  ...defaultSchema,
  // `defaultSchema` (GitHub's list) already covers the tags assistants actually
  // emit for display — headings, lists, tables, `blockquote`, `details`/
  // `summary`, `a`, `img`, `sub`/`sup`/`del`/`ins`, … — so this only adds the
  // two inline-formatting tags GitHub omits. `<iframe>`, `<style>`, `<script>`,
  // `<object>`, `<form>` and friends stay excluded.
  tagNames: [...(defaultSchema.tagNames ?? []), 'mark', 'u'],
  attributes: {
    ...defaultSchema.attributes,
    // `style` is allowed on every element; its declarations are already
    // filtered by `rehypeFilterInlineStyles` (runs before `rehypeSanitize`).
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'style'],
  },
}

export function remarkAddBlockCodeFlag() {
  return (tree: Root) => {
    visit(tree, 'code', (node: Code) => {
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

export const Markdown: React.FC<{
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
        if (!children) {
          return <pre></pre>
        }
        const arr = React.Children.toArray(children)
        if (
          arr.length === 1 &&
          React.isValidElement(arr[0]) &&
          (arr[0].props as { className?: string }).className === 'language-mermaid'
        ) {
          return arr[0]
        }
        return <pre {...props}>{children}</pre>
      },
      code({ node, className, children, ...props }) {
        const isBlockCode = node?.properties?.isBlockCode
        if (isBlockCode) {
          const match = /language-(\w+)/.exec(className || '')
          const language = match ? match[1] : undefined
          const fallback = (
            <pre>
              <code>{children}</code>
            </pre>
          )
          if (language === 'mermaid') {
            return (
              <Suspense fallback={fallback}>
                <MermaidDiagram className="bg-white" {...props}>
                  {String(children)}
                </MermaidDiagram>
              </Suspense>
            )
          } else {
            return (
              <Suspense fallback={fallback}>
                <CodeBlock
                  language={language}
                  value={String(children).replace(/\n$/, '')}
                  forExport={forExport}
                  {...props}
                />
              </Suspense>
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
        return <Table>{children}</Table>
      },
      th({ children }) {
        return <th className="break-words px-3 py-1">{children}</th>
      },
      td({ children }) {
        return <td className="break-words px-3 py-1">{children}</td>
      },
      a({ children, node: _node, ...props }) {
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
          rehypeRaw,
          rehypeFilterInlineStyles,
          [rehypeSanitize, markdownSanitizeSchema],
          rehypeKatex,
          [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
        ]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

export const MemoizedMarkdown: React.FC<{
  className: string
  children: string
  ref?: MutableRefObject<HTMLDivElement | null>
}> = memo(
  Markdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && prevProps.className === nextProps.className
)

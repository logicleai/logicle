import { htmlPlugin } from 'remark-docx/plugins/html'
import { TextRun } from 'docx'
import type { IRunOptions } from 'docx'
import type { RemarkDocxPlugin } from 'remark-docx'
import type { Plugin } from 'unified'
import type { InlineCode as MdastInlineCode, Root, RootContent, Text as MdastText } from 'mdast'

// Augment mdast's TextData so we can stash a colour on text nodes.
declare module 'mdast' {
  interface TextData {
    color?: string
  }

  interface InlineCodeData {
    color?: string
  }
}

// ── CSS color → 6-digit hex ────────────────────────────────────────────────

function cssColorToHex(color: string): string | undefined {
  const s = color.trim().toLowerCase()
  const named: Record<string, string> = {
    aqua: '00FFFF', black: '000000', blue: '0000FF', fuchsia: 'FF00FF',
    gray: '808080', green: '008000', lime: '00FF00', maroon: '800000',
    navy: '000080', olive: '808000', orange: 'FFA500', purple: '800080',
    red: 'FF0000', silver: 'C0C0C0', teal: '008080', white: 'FFFFFF',
    yellow: 'FFFF00', pink: 'FFC0CB', brown: 'A52A2A',
  }
  if (named[s]) return named[s]
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    if (hex.length === 3) return (hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]).toUpperCase()
    if (hex.length === 6) return hex.toUpperCase()
    if (hex.length === 8) return hex.slice(0, 6).toUpperCase()
  }
  const m = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (m) {
    return [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  return undefined
}

// ── MDAST tree walk ────────────────────────────────────────────────────────

interface NodeWithChildren {
  children: RootContent[]
}

function hasChildren(node: unknown): node is NodeWithChildren {
  return Array.isArray((node as NodeWithChildren)?.children)
}

/**
 * Remark MDAST transformer. Walks every parent node and collapses the
 * three-node pattern produced by remark for inline colour spans:
 *
 *   html('<span style="color:X">') + text('…') + html('</span>')
 *
 * into annotated mdast content with `data.color = 'RRGGBB'` on descendant
 * text nodes. The open/close html nodes are removed while preserving nested
 * markdown structure. Handles multiple consecutive spans at the same level.
 */
export const remarkColoredSpans: Plugin<[], Root> = () => {
  return (tree: Root) => {
    processNode(tree)
  }
}

function processNode(node: unknown) {
  if (!hasChildren(node)) return

  const original = node.children
  const result: RootContent[] = []
  let i = 0

  while (i < original.length) {
    const child = original[i]

    // Detect a coloured-span open tag
    if (
      child.type === 'html' &&
      /<span\b[^>]+style\s*=\s*["'][^"']*color[^"']*["'][^>]*>/i.test(child.value)
    ) {
      // Extract the colour value
      const colorMatch = child.value.match(/color\s*:\s*([^;"'>]+)/i)
      const color = colorMatch ? cssColorToHex(colorMatch[1].trim()) : undefined

      // Consume everything until the matching </span>
      i++
      let depth = 1
      const inner: RootContent[] = []

      while (i < original.length && depth > 0) {
        const cur = original[i]
        if (cur.type === 'html') {
          if (/^<\/span\b/i.test(cur.value)) {
            depth--
            if (depth === 0) { i++; break }
          } else if (/<span\b/i.test(cur.value)) {
            depth++
          }
        }
        inner.push(cur)
        i++
      }

      const spanContent = { children: inner }
      processNode(spanContent)

      for (const n of spanContent.children) {
        processNode(n)
        if (color) {
          annotateTextDescendants(n, color)
        }
        result.push(n)
      }
      continue
    }

    processNode(child)
    result.push(child)
    i++
  }

  node.children = result
}

function annotateTextDescendants(node: RootContent, color: string) {
  if (node.type === 'text') {
    const textNode = node as MdastText
    textNode.data = textNode.data?.color ? textNode.data : { ...textNode.data, color }
    return
  }

  if (node.type === 'inlineCode') {
    const inlineCodeNode = node as MdastInlineCode
    inlineCodeNode.data = inlineCodeNode.data?.color
      ? inlineCodeNode.data
      : { ...inlineCodeNode.data, color }
    return
  }

  if (!hasChildren(node)) return

  for (const child of node.children) {
    annotateTextDescendants(child, color)
  }
}

// ── remark-docx plugin ─────────────────────────────────────────────────────

const HYPERLINK_STYLE_ID = 'Hyperlink'

/**
 * remark-docx plugin that:
 *  1. Handles `html` nodes with the existing htmlPlugin behaviour.
 *  2. Overrides the `text` builder to honour `data.color` set by
 *     `remarkColoredSpans`, while preserving all other standard
 *     text-run properties (bold, italic, strike, link style, RTL).
 *
 * Use together with `remarkColoredSpans`:
 *   .use(remarkColoredSpans)
 *   .use(docx, { plugins: [coloredHtmlPlugin(), …] })
 */
export const coloredHtmlPlugin = (): RemarkDocxPlugin => {
  const fallback = htmlPlugin()
  return async (pluginCtx) => {
    const fallbackBuilders = await fallback(pluginCtx)
    const buildTextRun = (
      value: string,
      ctx: Parameters<NonNullable<typeof fallbackBuilders.text>>[1],
      color?: string
    ) => {
      const options: IRunOptions = {
        text: value,
        bold: ctx.style.bold,
        italics: ctx.style.italic,
        strike: ctx.style.strike,
        ...(color ? { color } : {}),
        ...(ctx.style.inlineCode ? { highlight: 'lightGray' as const } : {}),
        ...(ctx.style.link ? { style: HYPERLINK_STYLE_ID } : {}),
        ...(ctx.rtl ? { rightToLeft: true } : {}),
      }
      return new TextRun(options)
    }

    return {
      // Delegate HTML node handling to the standard htmlPlugin
      html: fallbackBuilders.html,

      // Override text builder to support colour from remarkColoredSpans
      text: (node, ctx) => {
        const color = (node as MdastText).data?.color
        return buildTextRun(node.value, ctx, color)
      },

      inlineCode: (node, ctx) => {
        const color = (node as MdastInlineCode).data?.color
        return buildTextRun(node.value, { ...ctx, style: { ...ctx.style, inlineCode: true } }, color)
      },
    }
  }
}

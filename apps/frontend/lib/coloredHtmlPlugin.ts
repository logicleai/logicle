import { htmlPlugin } from 'remark-docx/plugins/html'
import { TextRun } from 'docx'
import type { RemarkDocxPlugin } from 'remark-docx'

/**
 * Convert a CSS color value (named, #RGB, #RRGGBB, rgb()) to a 6-digit uppercase hex string
 * suitable for the docx `color` property (no leading `#`).
 */
function cssColorToHex(color: string): string | undefined {
  const s = color.trim().toLowerCase()
  const named: Record<string, string> = {
    aqua: '00FFFF',
    black: '000000',
    blue: '0000FF',
    fuchsia: 'FF00FF',
    gray: '808080',
    green: '008000',
    lime: '00FF00',
    maroon: '800000',
    navy: '000080',
    olive: '808000',
    orange: 'FFA500',
    purple: '800080',
    red: 'FF0000',
    silver: 'C0C0C0',
    teal: '008080',
    white: 'FFFFFF',
    yellow: 'FFFF00',
    pink: 'FFC0CB',
    brown: 'A52A2A',
  }
  if (named[s]) return named[s]
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    if (hex.length === 3) {
      return (hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]).toUpperCase()
    }
    if (hex.length === 6) return hex.toUpperCase()
    if (hex.length === 8) return hex.slice(0, 6).toUpperCase() // drop alpha
  }
  const m = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (m) {
    return [m[1], m[2], m[3]]
      .map((n) => parseInt(n).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }
  return undefined
}

interface RunOptions {
  color?: string
  bold?: boolean
  italic?: boolean
}

/**
 * Recursively convert a DOM subtree into an array of `TextRun` objects,
 * propagating colour and basic formatting from ancestor elements.
 * Uses the browser's built-in DOMParser — never called during SSR.
 */
function domNodeToRuns(node: Node, opts: RunOptions = {}): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    return text
      ? [new TextRun({ text, color: opts.color, bold: opts.bold, italics: opts.italic })]
      : []
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') return [new TextRun({ text: '', break: 1 })]
    const childOpts: RunOptions = { ...opts }
    if (tag === 'strong' || tag === 'b') childOpts.bold = true
    if (tag === 'em' || tag === 'i') childOpts.italic = true
    if (tag === 'span') {
      const style = el.getAttribute('style') ?? ''
      const match = style.match(/color\s*:\s*([^;]+)/)
      if (match) {
        const hex = cssColorToHex(match[1].trim())
        if (hex) childOpts.color = hex
      }
    }
    return Array.from(el.childNodes).flatMap((c) => domNodeToRuns(c, childOpts))
  }
  return []
}

/**
 * A drop-in replacement for `htmlPlugin()` that additionally preserves
 * `<span style="color:...">` colours as DOCX text run colours.
 *
 * For HTML without colour spans the behaviour is identical to the built-in
 * `htmlPlugin` (converts via hast-util-to-mdast then renders with ctx).
 */
export const coloredHtmlPlugin = (): RemarkDocxPlugin => {
  const fallback = htmlPlugin()
  return async (pluginCtx) => {
    const fallbackBuilders = await fallback(pluginCtx)
    return {
      html: (node, ctx) => {
        const { value } = node as { value: string }
        if (!/<span[^>]+style[^>]*color/i.test(value)) {
          // No colour spans — delegate to htmlPlugin
          return fallbackBuilders.html!(node, ctx)
        }
        // Parse with browser DOMParser (runs client-side only, inside an event handler)
        const doc = new DOMParser().parseFromString(value, 'text/html')
        const runs = Array.from(doc.body.childNodes).flatMap((n) => domNodeToRuns(n))
        return runs.length > 0 ? runs : null
      },
    }
  }
}

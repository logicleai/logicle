declare module 'remark-docx/plugins/html' {
  export { htmlPlugin } from 'remark-docx/lib/plugins/html/index.js'
}

declare module 'remark-docx/plugins/image' {
  export { imagePlugin } from 'remark-docx/lib/plugins/image/index.js'
}

declare module 'remark-docx/plugins/shiki' {
  import type { RemarkDocxPlugin } from 'remark-docx'
  import type { BundledTheme } from 'shiki'
  export interface ShikiPluginOptions {
    /** https://shiki.style/themes */
    theme: BundledTheme
  }
  export const shikiPlugin: (options: ShikiPluginOptions) => RemarkDocxPlugin
}

declare module 'remark-docx/plugins/latex' {
  import type { RemarkDocxPlugin } from 'remark-docx'
  export const latexPlugin: () => RemarkDocxPlugin
}

// ── Minimal hast types used by coloredHtmlPlugin ──────────────────────────────

declare module 'hast' {
  export interface Text {
    type: 'text'
    value: string
  }
  export interface Element {
    type: 'element'
    tagName: string
    properties: Record<string, unknown>
    children: ElementContent[]
  }
  export interface Comment {
    type: 'comment'
  }
  export type ElementContent = Element | Text | Comment
  export interface Root {
    type: 'root'
    children: ElementContent[]
  }
}

declare module 'hast-util-from-html' {
  import type { Root } from 'hast'
  export function fromHtml(html: string, options?: { fragment?: boolean }): Root
}

declare module 'hast-util-to-mdast' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function toMdast(hast: any, options?: any): any
}

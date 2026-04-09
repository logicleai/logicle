import { TextRun } from 'docx'
import type { IRunOptions } from 'docx'
import { getFileWithId } from '@/models/file'
import { storage } from '@/lib/storage'
import type { InlineCode as MdastInlineCode, Root, RootContent, Text as MdastText } from 'mdast'
import docx from 'remark-docx'
import { htmlPlugin } from 'remark-docx/plugins/html'
import { imagePlugin } from 'remark-docx/plugins/image'
import { latexPlugin } from 'remark-docx/plugins/latex'
import { shikiPlugin } from 'remark-docx/plugins/shiki'
import type { RemarkDocxPlugin } from 'remark-docx'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import type { Plugin } from 'unified'
import { unified } from 'unified'

declare module 'mdast' {
  interface TextData {
    color?: string
  }

  interface InlineCodeData {
    color?: string
  }
}

function cssColorToHex(color: string): string | undefined {
  const s = color.trim().toLowerCase()
  const named: Record<string, string> = {
    aqua: '00FFFF',
    black: '000000',
    blue: '0000FF',
    brown: 'A52A2A',
    fuchsia: 'FF00FF',
    gray: '808080',
    green: '008000',
    lime: '00FF00',
    maroon: '800000',
    navy: '000080',
    olive: '808000',
    orange: 'FFA500',
    pink: 'FFC0CB',
    purple: '800080',
    red: 'FF0000',
    silver: 'C0C0C0',
    teal: '008080',
    white: 'FFFFFF',
    yellow: 'FFFF00',
  }
  if (named[s]) return named[s]
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    if (hex.length === 3) return `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase()
    if (hex.length === 6) return hex.toUpperCase()
    if (hex.length === 8) return hex.slice(0, 6).toUpperCase()
  }
  const rgb = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) => Number.parseInt(n, 10).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }
  return undefined
}

interface NodeWithChildren {
  children: RootContent[]
}

function hasChildren(node: unknown): node is NodeWithChildren {
  return Array.isArray((node as NodeWithChildren)?.children)
}

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

    if (
      child.type === 'html' &&
      /<span\b[^>]+style\s*=\s*["'][^"']*color[^"']*["'][^>]*>/i.test(child.value)
    ) {
      const colorMatch = child.value.match(/color\s*:\s*([^;"'>]+)/i)
      const color = colorMatch ? cssColorToHex(colorMatch[1].trim()) : undefined

      i++
      let depth = 1
      const inner: RootContent[] = []

      while (i < original.length && depth > 0) {
        const cur = original[i]
        if (cur.type === 'html') {
          if (/^<\/span\b/i.test(cur.value)) {
            depth--
            if (depth === 0) {
              i++
              break
            }
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

const HYPERLINK_STYLE_ID = 'Hyperlink'

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
      html: fallbackBuilders.html,
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

function dataUrlToArrayBuffer(url: string): ArrayBuffer {
  const [, payload = ''] = url.split(',', 2)
  const buffer = Buffer.from(payload, 'base64')
  return Uint8Array.from(buffer).buffer
}

async function loadImageData(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    return dataUrlToArrayBuffer(url)
  }

  const pathname = (() => {
    if (url.startsWith('/')) return url
    try {
      return new URL(url).pathname
    } catch {
      return url
    }
  })()

  const fileMatch = pathname.match(/^\/api\/files\/([^/]+)\/content$/)
  if (fileMatch) {
    const file = await getFileWithId(fileMatch[1])
    if (!file) {
      throw new Error(`Missing file for DOCX export image: ${fileMatch[1]}`)
    }
    const data = await storage.readBuffer(file.path, !!file.encrypted)
    return Uint8Array.from(data).buffer
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load image: ${url}`)
  }
  return await response.arrayBuffer()
}

async function fallbackSvgToBuffer({ buffer }: { buffer: ArrayBuffer }) {
  return buffer
}

export async function renderDocxFromMarkdown(markdown: string): Promise<Uint8Array> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkColoredSpans)
    .use(docx, {
      plugins: [
        coloredHtmlPlugin(),
        latexPlugin(),
        shikiPlugin({ theme: 'github-light' }),
        imagePlugin({ load: loadImageData, fallbackSvg: fallbackSvgToBuffer }),
      ],
    })

  const file = await processor.process(markdown)
  return new Uint8Array(await file.result)
}

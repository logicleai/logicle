import * as ai from 'ai'
import * as schema from '@/db/schema'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { logger } from '@/lib/logging'
import { storage } from '@/lib/storage'
import { LlmModelCapabilities } from './models'
import mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import { ensureABView } from '../utils'
import { sheetToMarkdown } from '../xlstomarkdown'
import micromatch from 'micromatch'
import env from '../env'
import { gfm } from 'turndown-plugin-gfm'
import TurndownService, { Node as TurndownNode } from 'turndown'
import { PDFExtract } from 'pdf.js-extract'

const loadImagePartFromFileEntry = async (fileEntry: schema.File): Promise<ai.ImagePart> => {
  const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  const image: ai.ImagePart = {
    type: 'image',
    image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
  }
  return image
}

const loadFilePartFromFileEntry = async (fileEntry: schema.File): Promise<ai.FilePart> => {
  const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  const image: ai.FilePart = {
    type: 'file',
    data: fileContent.toString('base64'),
    mediaType: fileEntry.type,
  }
  return image
}

type Converter = (buffer: Buffer) => Promise<string>

function hasGetAttribute(n: unknown): n is { getAttribute(name: string): string | null } {
  return !!n && typeof (n as any).getAttribute === 'function'
}

function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx', // # H1, ## H2, ...
    codeBlockStyle: 'fenced', // ``` fenced blocks
    bulletListMarker: '-', // -, *, or +
    emDelimiter: '_', // _emphasis_ vs *emphasis*
    br: '\n', // <br> → newline
  })

  // Enable GitHub-flavored Markdown features
  td.use([gfm])

  td.addRule('fencedCodeWithLanguage', {
    filter: (node) => {
      return node.nodeName === 'PRE' && (node as HTMLElement).firstElementChild?.nodeName === 'CODE'
    },
    replacement: (_content, node) => {
      const codeEl = (node as HTMLElement).firstElementChild as HTMLElement
      const className = (codeEl.getAttribute('class') || '').toLowerCase()

      // Extract language (supports language-xxx or lang-xxx)
      const lang =
        className.match(/language-([\w-]+)/)?.[1] ||
        className.match(/lang(?:uage)?-([\w-]+)/)?.[1] ||
        ''

      const codeText = (codeEl.textContent || '').trimEnd()
      const fence = '```'

      return `\n${fence}${lang}\n${codeText}\n${fence}\n`
    },
  })
  td.addRule('cleanImages', {
    filter: 'img',
    replacement: (_content: string, node: TurndownNode) => {
      // Narrow the turndown node to something with getAttribute
      if (!hasGetAttribute(node)) return '' // or fall back to default behavior

      const alt = (node.getAttribute('alt') || '').replace(/\n/g, ' ')
      const src = node.getAttribute('src') || ''
      const title = node.getAttribute('title')

      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
    },
  }) // Optionally keep line breaks inside paragraphs (helps with Word line breaks)
  td.keep(['br'])

  return td
}

const wordConverter: Converter = async (data: Buffer) => {
  const { value: html } = await mammoth.convertToHtml({
    buffer: data,
  })
  const turndown = createTurndown()
  const markdown = turndown.turndown(html)
  return markdown
}

const excelConverter: Converter = async (data: Buffer) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(ensureABView(data).buffer)
  const ws = wb.worksheets[0]
  return sheetToMarkdown(ws, { headerRow: 1 })
}

const genericTextConverter: Converter = async (data: Buffer) => {
  return data.toString('utf8')
}

const pdfConverter: Converter = async (data: Buffer) => {
  return new Promise((resolve, reject) => {
    const pdfExtract = new PDFExtract()
    const options = { normalizeWhitespace: true }

    pdfExtract.extractBuffer(data, options, (err, data) => {
      if (err) return reject(err)
      if (data) {
        const text = data.pages
          .map((page) => page.content.map((item) => item.str).join(' '))
          .join('\n\n')

        resolve(text)
      }
    })
  })
}

export const converters: Record<string, Converter> = {
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']: wordConverter,
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']: excelConverter,
  ['application/pdf']: pdfConverter,
  ['text/*']: genericTextConverter,
}

const findConverter = (desiredFileType: string) => {
  if (!env.chat.enableAttachmentConversion) {
    return undefined
  }
  return Object.entries(converters).find(([fileType, _converter]) => {
    return micromatch.isMatch(desiredFileType, fileType)
  })?.[1]
}

// Not easy to do it right... Claude will crash if the input image format is not supported
// But if a user uploads say a image/svg+xml file, and we simply remove it here...
// we might crash for empty content, or the LLM can complain because nothing is uploaded
// The issue is even more serious because if a signle request is not valid, we can't continue the conversation!!!
const acceptableImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export const dtoMessageToLlmMessage = async (
  m: dto.Message,
  capabilities: LlmModelCapabilities
): Promise<ai.ModelMessage | undefined> => {
  if (m.role === 'tool-auth-request') return undefined
  if (m.role === 'tool-auth-response') return undefined
  if (m.role === 'tool') {
    const results = m.parts.filter((m) => m.type === 'tool-result')
    if (results.length === 0) return undefined
    return {
      role: 'tool',
      content: results.map((result) => {
        return {
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          output: {
            type: 'json',
            value: result.result,
          },
          type: 'tool-result',
        }
      }),
    }
  } else if (m.role === 'assistant') {
    type ContentArrayElement = Extract<ai.AssistantContent, any[]>[number]
    const parts: ContentArrayElement[] = []
    m.parts.forEach((part) => {
      if (part.type === 'tool-call') {
        parts.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.args,
        })
      } else if (part.type === 'text') {
        parts.push({
          type: 'text',
          text: part.text,
        })
      } else if (part.type === 'builtin-tool-result') {
        // builtin tools are just... notifications
      } else if (part.type === 'reasoning' && part.reasoning_signature) {
        parts.push({
          type: 'reasoning',
          text: part.reasoning,
          providerOptions: {
            anthropic: {
              signature: part.reasoning_signature,
            },
          },
        })
      }
    })
    return {
      role: 'assistant',
      content: parts,
    }
  }
  const message: ai.ModelMessage = {
    role: m.role,
    content: m.content,
  }
  if (m.attachments.length !== 0) {
    const messageParts: typeof message.content = []
    if (m.content.length !== 0)
      messageParts.push({
        type: 'text',
        text: m.content,
      })
    const fileParts = (
      await Promise.all(
        m.attachments.map(async (a) => {
          const fileEntry = await getFileWithId(a.id)
          if (!fileEntry) {
            logger.warn(`Can't find entry for attachment ${a.id}`)
            return undefined
          }
          if (capabilities.vision && acceptableImageTypes.includes(fileEntry.type)) {
            return loadImagePartFromFileEntry(fileEntry)
          }
          if (capabilities.supportedMedia?.includes(fileEntry.type)) {
            return loadFilePartFromFileEntry(fileEntry)
          } else {
            const converter = findConverter(fileEntry.type)
            if (converter) {
              const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
              const text = await converter(fileContent)
              if (text) {
                return {
                  type: 'text',
                  text: `Here is the text content of the file "${fileEntry.name}" with id ${fileEntry.id}\n${text}`,
                } satisfies ai.TextPart
              }
            }
            return {
              type: 'text',
              text: `The content of the file "${fileEntry.name}" with id ${fileEntry.id} could not be extracted. It is possible that some tools can return the content on demand`,
            } satisfies ai.TextPart
          }
        })
      )
    ).filter((a) => a !== undefined)
    if (m.attachments.length) {
      messageParts.push({
        type: 'text',
        text: `The user has attached the following files to this chat: \n${JSON.stringify(
          m.attachments
        )}`,
      })
    }
    message.content = [...messageParts, ...fileParts]
  }
  return message
}

export const sanitizeOrphanToolCalls = (messages: ai.ModelMessage[]) => {
  const pendingToolCalls = new Map<string, ai.ToolCallPart>()
  const output: ai.ModelMessage[] = []

  const addFakeToolResults = () => {
    for (const [toolCallId, pendingCall] of pendingToolCalls) {
      logger.info('Adding tool response to sanitize ')
      output.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: toolCallId,
            toolName: pendingCall.toolName,
            output: {
              type: 'text',
              value: 'not available',
            },
          },
        ],
      })
    }
    pendingToolCalls.clear()
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      for (const part of message.content) {
        pendingToolCalls.delete(part.toolCallId)
      }
    } else {
      addFakeToolResults()
    }
    output.push(message)
    if (message.role === 'assistant' && typeof message.content !== 'string') {
      for (const part of message.content) {
        if (part.type === 'tool-call') {
          pendingToolCalls.set(part.toolCallId, part)
        }
      }
    }
  }
  return output
}

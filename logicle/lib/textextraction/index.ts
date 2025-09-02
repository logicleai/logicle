import mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import { ensureABView } from '../utils'
import { sheetToMarkdown } from './xlstomarkdown'
import micromatch from 'micromatch'
import env from '../env'
import { gfm } from 'turndown-plugin-gfm'
import TurndownService, { Node as TurndownNode } from 'turndown'
import { PDFExtract } from 'pdf.js-extract'

type TextExtractor = (buffer: Buffer) => Promise<string>

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

const wordExtractor: TextExtractor = async (data: Buffer) => {
  const { value: html } = await mammoth.convertToHtml({
    buffer: data,
  })
  const turndown = createTurndown()
  const markdown = turndown.turndown(html)
  return markdown
}

const excelExtractor: TextExtractor = async (data: Buffer) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(ensureABView(data).buffer)
  const ws = wb.worksheets[0]
  return sheetToMarkdown(ws, { headerRow: 1 })
}

const genericTextExtractor: TextExtractor = async (data: Buffer) => {
  return data.toString('utf8')
}

const pdfExtractor: TextExtractor = async (data: Buffer) => {
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

export const textExtractors: Record<string, TextExtractor> = {
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']: wordExtractor,
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']: excelExtractor,
  ['application/pdf']: pdfExtractor,
  ['text/*']: genericTextExtractor,
}

export const findExtractor = (fileType: string) => {
  return Object.entries(textExtractors).find(([_fileType, _converter]) => {
    return micromatch.isMatch(fileType, _fileType)
  })?.[1]
}

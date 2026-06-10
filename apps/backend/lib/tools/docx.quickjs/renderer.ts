import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export async function readDocxAsMarkdown(data: Buffer | Uint8Array): Promise<string> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const { value: html } = await mammoth.convertToHtml({ buffer })
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    br: '\n',
  })
  td.use([gfm])
  td.addRule('stripImages', { filter: 'img', replacement: () => '[image]' })
  return td.turndown(html)
}

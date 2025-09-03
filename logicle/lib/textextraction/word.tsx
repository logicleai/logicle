import mammoth from 'mammoth'
import { gfm } from 'turndown-plugin-gfm'
import TurndownService, { Node as TurndownNode } from 'turndown'
import { TextExtractionOption, TextExtractor } from '.'

function hasGetAttribute(n: unknown): n is { getAttribute(name: string): string | null } {
  return !!n && typeof (n as any).getAttribute === 'function'
}

function createTurndown(options?: TextExtractionOption) {
  const td = new TurndownService({
    headingStyle: 'atx', // # H1, ## H2, ...
    codeBlockStyle: 'fenced', // ``` fenced blocks
    bulletListMarker: '-', // -, *, or +
    emDelimiter: '_', // _emphasis_ vs *emphasis*
    br: '\n', // <br> → newline
  })

  // Enable GitHub-flavored Markdown features
  td.use([gfm])

  td.addRule('forceGfmTables', {
    filter: (node) => node.nodeName === 'TABLE',
    replacement: (_content, node) => {
      const table = node as HTMLTableElement
      const rows = Array.from(table.rows) as HTMLTableRowElement[]
      if (!rows.length) return '\n\n'

      // pick header: <thead> first row, else first row
      const headRow = table.tHead?.rows[0] || rows[0] || null
      const bodyRows =
        headRow && table.tHead
          ? Array.from(table.tBodies).flatMap((tb) => Array.from(tb.rows))
          : rows.slice(1)

      const headerCells = headRow ? Array.from(headRow.cells) : []
      if (!headerCells.length) return '\n\n'

      const cellToText = (cell: HTMLTableCellElement) => {
        // Convert inner HTML to inline MD, then flatten to one line
        return td
          .turndown(cell.innerHTML)
          .replace(/\n+/g, '<br>') // keep hard breaks inside cells
          .replace(/\|/g, '\\|') // escape pipes
          .trim()
      }

      const getAlign = (cell: HTMLTableCellElement): 'left' | 'center' | 'right' | 'none' => {
        const attr = (cell.getAttribute('align') || '').toLowerCase()
        if (attr === 'center' || attr === 'right' || attr === 'left') return attr as any
        const style = (cell.getAttribute('style') || '').toLowerCase()
        if (/text-align:\s*center/.test(style)) return 'center'
        if (/text-align:\s*right/.test(style)) return 'right'
        if (/text-align:\s*left/.test(style)) return 'left'
        return 'none'
      }

      // If there are complex spans, we still attempt a best-effort markdown table.
      const hasSpans =
        headerCells.some((c) => c.colSpan > 1 || c.rowSpan > 1) ||
        bodyRows.some((r) => Array.from(r.cells).some((c) => c.colSpan > 1 || c.rowSpan > 1))

      const header = headerCells.map(cellToText)
      const aligns = headerCells
        .map(getAlign)
        .map((a) =>
          a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'
        )

      const toRow = (cols: string[]) => `| ${cols.join(' | ')} |`

      const body = bodyRows.map((r) => {
        const cells = Array.from(r.cells) as HTMLTableCellElement[]
        // pad/truncate to header width for sanity
        const cols = cells.slice(0, header.length).map(cellToText)
        while (cols.length < header.length) cols.push('')
        return toRow(cols)
      })

      const md = [toRow(header), toRow(aligns), ...body].join('\n')

      // If spans existed, this is best-effort; still better than raw HTML.
      return `\n\n${md}\n\n`
    },
  })

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

  // --- Replace images with a placeholder ---
  if (options?.keepImages ?? false) {
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
  } else {
    td.addRule('stripImages', {
      filter: 'img',
      replacement: () => '[image]',
    })
  }

  td.keep(['br'])

  return td
}

export const wordExtractor: TextExtractor = async (data: Buffer) => {
  const { value: html } = await mammoth.convertToHtml({
    buffer: data,
  })
  const turndown = createTurndown()
  const markdown = turndown.turndown(html)
  return markdown
}

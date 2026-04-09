import JSZip from 'jszip'
import { describe, expect, test } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import docx from 'remark-docx'
import { htmlPlugin } from 'remark-docx/plugins/html'

const problematicMarkdown = `**ISTRUZIONE OPERATIVA**

| Data | numero |
| --- | --- |
| FEB. 2026 | 0 - emissione |
| <span style="color:blue">MAR. 2026</span> | <span style="color:blue">1 - revisione</span> |

| **FASE** | **PRESIDIO** |
| --- | --- |
| Sistema Informatico Aziendale | Regolamento aziendale;<br>Registro delle Attività di Trattamento;<br>Manuale <span style="color:blue">(incluse le misure di sicurezza)</span> |
`

async function renderDocx(markdown: string) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(docx, {
      plugins: [htmlPlugin()],
    })
  const out = await processor.process(markdown)
  return Buffer.from(await out.result)
}

async function getDocumentXml(markdown: string) {
  const buffer = await renderDocx(markdown)
  const zip = await JSZip.loadAsync(buffer)
  return zip.file('word/document.xml')!.async('string')
}

describe('DOCX export', () => {
  test('renders raw html markup without nested paragraphs', async () => {
    const xml = await getDocumentXml(problematicMarkdown)

    expect(problematicMarkdown).toContain('<span')
    expect(problematicMarkdown).toContain('<br>')
    expect(xml).not.toMatch(/<w:p\b[^>]*>\s*(?:<w:pPr\b[\s\S]*?<\/w:pPr>)?\s*<w:p\b/g)
    expect(xml).toContain('MAR. 2026')
    expect(xml).toContain('1 - revisione')
    expect(xml).not.toContain('&lt;span')
    expect(xml).not.toContain('&lt;br&gt;')
  })

  test('preserves inline code as literal text', async () => {
    const xml = await getDocumentXml('Use `const markup = "<span>"` in code.')

    expect(xml).toContain('const markup = &quot;&lt;span&gt;&quot;')
  })
})

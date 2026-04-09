import JSZip from 'jszip'
import { describe, expect, test } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import docx from 'remark-docx'
import { coloredHtmlPlugin, remarkColoredSpans } from '../apps/frontend/lib/coloredHtmlPlugin'

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
    .use(remarkColoredSpans)
    .use(docx, {
      plugins: [coloredHtmlPlugin()],
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

  test('preserves color for markdown nested inside colored spans', async () => {
    const xml = await getDocumentXml('<span style="color:blue">**bold**</span>')

    expect(xml).toContain('bold')
    expect(xml).toContain('w:color w:val="0000FF"')
    expect(xml).toContain('<w:b/>')
  })

  test('lets nested colored spans override the parent color', async () => {
    const xml = await getDocumentXml(
      '<span style="color:red">outer <span style="color:blue">inner</span> tail</span>'
    )

    expect(xml).toContain('outer ')
    expect(xml).toContain('inner')
    expect(xml).toContain(' tail')
    expect(xml).toContain('w:color w:val="FF0000"')
    expect(xml).toContain('w:color w:val="0000FF"')
  })

  test('preserves color on markdown links inside colored spans', async () => {
    const xml = await getDocumentXml('<span style="color:#0f0">[docs](https://example.com)</span>')

    expect(xml).toContain('docs')
    expect(xml).toContain('w:color w:val="00FF00"')
    expect(xml).toContain('w:rStyle w:val="Hyperlink"')
  })

  test('supports rgb colors on inline code inside colored spans', async () => {
    const xml = await getDocumentXml('<span style="color:rgb(255, 128, 0)">`warn()`</span>')

    expect(xml).toContain('warn()')
    expect(xml).toContain('w:color w:val="FF8000"')
    expect(xml).toContain('w:highlight w:val="lightGray"')
  })
})

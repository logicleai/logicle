import { describe, expect, test, vi } from 'vitest'
import type { ToolInvokeParams } from '@/lib/chat/tools'

vi.mock('@/models/file', () => ({ getFileWithId: vi.fn() }))
vi.mock('@/backend/lib/files/authorization', () => ({ canAccessFile: vi.fn() }))
vi.mock('@/lib/storage', () => ({ storage: { readBuffer: vi.fn() } }))
vi.mock('@/backend/lib/files/materialize', () => ({ materializeFile: vi.fn() }))
vi.mock('@/backend/lib/tools/ownership', () => ({ resolveFileOwner: vi.fn() }))

const invokeScript = async (code: string) => {
  const { OfficeQuickJsTool } = await import('@/backend/lib/tools/office.quickjs/implementation')
  const tool = new OfficeQuickJsTool(
    { id: 'office.quickjs', name: 'office.quickjs', provisioned: true, promptFragment: '' },
    {}
  )
  const fn = tool.functions_.office_script
  if (fn.type === 'provider') {
    throw new Error('Expected office_script to be a function tool')
  }
  return await fn.invoke({
    llmModel: {} as ToolInvokeParams['llmModel'],
    messages: [],
    assistantId: 'a1',
    userId: 'u1',
    params: { code },
    uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
  })
}

const textOf = (result: any): string => {
  expect(result.type).toBe('content')
  return result.value[0].text as string
}

describe('office.quickjs office_script', () => {
  test('creates an xlsx, edits its XML with an inline string, and extracts text', async () => {
    const result = await invokeScript(`
        const blob = createXlsx(JSON.stringify({
          sheets: [{ name: 'Data', rows: [['Name', 'Qty'], ['Widget', 42]], columnWidths: [20, 8] }],
        }))
        log('size=' + blobSize(blob))
        const h = openDocument(blob)
        const files = JSON.parse(listFiles(h))
        log('hasSheet=' + files.includes('xl/worksheets/sheet1.xml'))
        let xml = readXml(h, 'xl/worksheets/sheet1.xml')
        xml = xml.replace('</sheetData>',
          '<row r="3"><c r="A3" t="inlineStr"><is><t>Gadget</t></is></c></row></sheetData>')
        xml = xml.replace(/<dimension ref="[^"]*"\\/>/, '<dimension ref="A1:B3"/>')
        writeXml(h, 'xl/worksheets/sheet1.xml', xml)
        log('roundtrip=' + readXml(h, 'xl/worksheets/sheet1.xml').includes('Gadget'))
        const out = saveDocument(h)
        const md = extractText(out, 'data.xlsx')
        log('hasWidget=' + md.includes('Widget'))
        log('hasGadget=' + md.includes('Gadget'))
      `)
    const text = textOf(result)
    expect(text).toContain('hasSheet=true')
    expect(text).toContain('roundtrip=true')
    expect(text).toContain('hasWidget=true')
    expect(text).toContain('hasGadget=true')
  }, 30000)

  test('builds a docx from scratch with newDocument and reads it back as markdown', async () => {
    const result = await invokeScript(`
        const h = newDocument()
        writeXml(h, '[Content_Types].xml',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>')
        writeXml(h, '_rels/.rels',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>')
        writeXml(h, 'word/document.xml',
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          '<w:body><w:p><w:r><w:t>Hello from scratch</w:t></w:r></w:p></w:body></w:document>')
        const blob = saveDocument(h)
        log('md=' + extractText(blob, 'doc.docx'))
      `)
    expect(textOf(result)).toContain('Hello from scratch')
  }, 30000)

  test('reports script errors as error-text', async () => {
    const result = await invokeScript(`openDocument('blob:999')`)
    expect(result.type).toBe('error-text')
    expect((result as any).value).toContain('Invalid blob id')
  })
})

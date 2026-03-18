import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { analyzeFileBuffer } from '../src/analyzers'

const createPdfBuffer = () => {
  const stream = `BT
/F1 24 Tf
72 100 Td
(Hello PDF) Tj
ET`
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${Buffer.byteLength(stream, 'utf8')} >>
stream
${stream}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000241 00000 n
0000000335 00000 n
trailer
<< /Root 1 0 R /Size 6 >>
startxref
405
%%EOF`

  return Buffer.from(pdf, 'utf8')
}

const createXlsBuffer = () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Value'],
    ['alpha', 1],
    ['beta', 2],
  ])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xls' }))
}

const createDocxBuffer = async () => {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello Word</w:t></w:r></w:p>
  </w:body>
</w:document>`
  )
  return await zip.generateAsync({ type: 'nodebuffer' })
}

const createPptxBuffer = async () => {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  )
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`
  )
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Hello Slides</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`
  )
  return await zip.generateAsync({ type: 'nodebuffer' })
}

describe('file analysis extractors', () => {
  test('analyzes PDF files', async () => {
    const payload = await analyzeFileBuffer(createPdfBuffer(), 'application/pdf')
    expect(payload.kind).toBe('pdf')
    if (payload.kind !== 'pdf') {
      throw new Error('Unexpected payload kind')
    }
    expect(payload.pageCount).toBe(1)
    expect(payload.textCharCount).toBeGreaterThan(0)
    expect(payload.extractedText).toContain('Hello PDF')
  })

  test('analyzes image files', async () => {
    const buffer = await sharp({
      create: {
        width: 4,
        height: 3,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer()

    const payload = await analyzeFileBuffer(buffer, 'image/png')
    expect(payload.kind).toBe('image')
    if (payload.kind !== 'image') {
      throw new Error('Unexpected payload kind')
    }
    expect(payload.width).toBe(4)
    expect(payload.height).toBe(3)
    expect(payload.hasAlpha).toBe(true)
    expect(payload.extractedText).toBeNull()
  })

  test('analyzes xls spreadsheets', async () => {
    const payload = await analyzeFileBuffer(createXlsBuffer(), 'application/vnd.ms-excel')
    expect(payload.kind).toBe('spreadsheet')
    if (payload.kind !== 'spreadsheet') {
      throw new Error('Unexpected payload kind')
    }
    expect(payload.sheetCount).toBe(1)
    expect(payload.textCharCount).toBeGreaterThan(0)
    expect(payload.extractedText).toContain('alpha')
  })

  test('analyzes docx word files', async () => {
    const payload = await analyzeFileBuffer(
      await createDocxBuffer(),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    expect(payload.kind).toBe('word')
    if (payload.kind !== 'word') {
      throw new Error('Unexpected payload kind')
    }
    expect(payload.textCharCount).toBeGreaterThan(0)
    expect(payload.extractedText).toContain('Hello Word')
  })

  test('analyzes pptx presentation files', async () => {
    const payload = await analyzeFileBuffer(
      await createPptxBuffer(),
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
    expect(payload.kind).toBe('presentation')
    if (payload.kind !== 'presentation') {
      throw new Error('Unexpected payload kind')
    }
    expect(payload.slideCount).toBe(1)
    expect(payload.textCharCount).toBeGreaterThan(0)
    expect(payload.extractedText).toContain('Hello Slides')
  })
})

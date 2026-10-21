import { deflateSync } from 'node:zlib'

export const pdfFixtureKinds = [
  'direct-name',
  'direct-array',
  'indirect-name',
  'indirect-array',
  'indirect-array-item',
  'contents-array',
  'form',
  'to-unicode',
  'indirect-params',
  'params-array-null',
  'cmap-escaped',
  'cmap-nested',
  'cmap-octal',
  'cmap-continuation',
  'cmap-stray-delimiter',
  'cmap-unterminated',
] as const

type PdfFixtureKind = (typeof pdfFixtureKinds)[number]

const stream = (data: Buffer, entries: string) =>
  Buffer.concat([
    Buffer.from(`<< /Length ${data.length} ${entries} >>\nstream\n`),
    data,
    Buffer.from('\nendstream'),
  ])

const buildPdf = (objects: Array<string | Buffer>) => {
  const parts = [Buffer.from('%PDF-1.4\n')]
  const offsets = [0]
  let length = parts[0].length
  for (const [index, object] of objects.entries()) {
    offsets.push(length)
    const bytes = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      Buffer.isBuffer(object) ? object : Buffer.from(object),
      Buffer.from('\nendobj\n'),
    ])
    parts.push(bytes)
    length += bytes.length
  }
  const xref = [
    `xref\n0 ${offsets.length}\n0000000000 65535 f \n`,
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`,
  ].join('')
  return Buffer.concat([...parts, Buffer.from(xref)])
}

// Synthetic PDFs only: one font, one page and known text, with different legal
// encodings of stream filters or font metadata. No tenant documents are fixtures.
export const createPdfFixture = (kind: PdfFixtureKind) => {
  const objects: Array<string | Buffer> = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '',
  ]
  let resources = '/Resources << /Font << /F1 4 0 R >> >>'
  let contents = '5 0 R'
  let content = Buffer.from('BT /F1 12 Tf 20 50 Td (Hello 11) Tj ET\n')
  let expectedText = 'Hello 11'
  let filter = '/Filter /FlateDecode'
  let parameters = ''
  let data = deflateSync(content)

  if (kind === 'direct-array') filter = '/Filter [/FlateDecode]'
  if (kind === 'indirect-name' || kind === 'indirect-array') {
    filter = '/Filter 6 0 R'
    objects.push(kind === 'indirect-name' ? '/FlateDecode' : '[/FlateDecode]')
  }
  if (kind === 'indirect-array-item') {
    filter = '/Filter [6 0 R]'
    objects.push('/FlateDecode')
  }
  if (kind === 'contents-array') {
    contents = '[5 0 R]'
    filter = '/Filter 6 0 R'
    objects.push('[/FlateDecode]')
  }
  if (kind === 'form') {
    resources = '/Resources << /XObject << /Fm1 6 0 R >> >>'
    objects.push(
      stream(
        deflateSync(content),
        '/Type /XObject /Subtype /Form /BBox [0 0 100 100] /Resources << /Font << /F1 4 0 R >> >> /Filter 7 0 R'
      ),
      '[/FlateDecode]'
    )
    data = deflateSync(Buffer.from('/Fm1 Do\n'))
  }
  if (kind === 'to-unicode' || kind.startsWith('cmap-')) {
    expectedText = 'Ω'
    content = Buffer.from('BT /F1 12 Tf 20 50 Td (A) Tj ET\n')
    data = deflateSync(content)
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>'
    let cmap =
      '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Test def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange 1 beginbfchar <41> <03A9> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end'
    if (kind === 'cmap-escaped') cmap = cmap.replace('(Adobe)', String.raw`(A\(B\))`)
    if (kind === 'cmap-nested') cmap = cmap.replace('(Adobe)', '(A(B))')
    if (kind === 'cmap-octal') cmap = cmap.replace('(Adobe)', String.raw`(A\050B\051)`)
    if (kind === 'cmap-continuation') cmap = cmap.replace('(Adobe)', '(A\\\nB)')
    if (kind === 'cmap-stray-delimiter') {
      cmap = `) ${cmap}`
      expectedText = 'A'
    }
    if (kind === 'cmap-unterminated') {
      cmap = '/Registry (unterminated'
      expectedText = 'A'
    }
    objects.push(
      stream(
        deflateSync(Buffer.from(cmap)),
        kind === 'to-unicode' ? '/Filter 7 0 R' : '/Filter /FlateDecode'
      ),
      '[/FlateDecode]'
    )
  }
  if (kind === 'indirect-params' || kind === 'params-array-null') {
    // PNG Sub prediction makes DecodeParms necessary: ignoring it leaves
    // differences between adjacent bytes rather than the original text.
    const predicted = Buffer.from(
      content.map((byte, index) => (byte - (content[index - 1] ?? 0)) & 255)
    )
    data = deflateSync(Buffer.concat([Buffer.from([1]), predicted]))
    objects.push(`<< /Predictor 15 /Columns ${content.length} /Colors 1 /BitsPerComponent 8 >>`)
    parameters = '/DecodeParms 6 0 R'
    if (kind === 'params-array-null') {
      data = Buffer.from(`${data.toString('hex')}>`)
      filter = '/Filter [/ASCIIHexDecode /FlateDecode]'
      parameters = '/DecodeParms [null 6 0 R]'
    }
  }
  objects[4] = stream(data, `${filter} ${parameters}`)
  objects[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] ${resources} /Contents ${contents} >>`
  return { buffer: buildPdf(objects), expectedText }
}

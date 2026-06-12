import { describe, expect, test, vi } from 'vitest'
import type { ToolInvokeParams } from '@/lib/chat/tools'
import JSZip from 'jszip'

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7cAAAAASUVORK5CYII='

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

const createPptxTemplateBuffer = async () => {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  )
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`
  )
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree/></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`
  )
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
  )
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree/></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`
  )
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  )
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="1" name="title"/></p:nvSpPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>TITLE_PLACEHOLDER</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="body"/></p:nvSpPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>BODY_PLACEHOLDER</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`
  )
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
  )
  return zip.generateAsync({ type: 'nodebuffer' })
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

  test('clones and patches slides through the high-level PPTX helpers', async () => {
    const templateBase64 = (await createPptxTemplateBuffer()).toString('base64')
    const result = await invokeScript(`
        const template = blobFromBase64('${templateBase64}')
        const pres = createPresentationFromTemplate(template)
        log('slidesBefore=' + getSlideCount(pres))
        const slide2 = cloneSlide(pres, 0)
        replaceAllText(pres, 0, {
          TITLE_PLACEHOLDER: 'Intro',
          BODY_PLACEHOLDER: 'Body 1',
        })
        replaceText(pres, slide2, 'TITLE_PLACEHOLDER', 'Clone')
        replaceText(pres, slide2, 'BODY_PLACEHOLDER', 'Body 2')
        const out = savePresentation(pres)
        const reopened = openPresentation(out)
        log('slidesAfter=' + getSlideCount(reopened))
        const text = extractText(out, 'deck.pptx')
        log('hasIntro=' + text.includes('Intro'))
        log('hasClone=' + text.includes('Clone'))
        log('hasBody2=' + text.includes('Body 2'))
      `)
    const text = textOf(result)
    expect(text).toContain('slidesBefore=1')
    expect(text).toContain('slidesAfter=2')
    expect(text).toContain('hasIntro=true')
    expect(text).toContain('hasClone=true')
    expect(text).toContain('hasBody2=true')
  }, 30000)

  test('creates a presentation from the built-in template and places an image', async () => {
    const result = await invokeScript(`
        const pres = createPresentation()
        const slide2 = addSlide(pres)
        replaceAllText(pres, 0, {
          TITLE_PLACEHOLDER: 'Maxwell',
          BODY_PLACEHOLDER: 'Onde elettromagnetiche\\nSeconda riga',
        })
        replaceText(pres, slide2, 'TITLE_PLACEHOLDER', 'Slide 2')
        replaceText(pres, slide2, 'BODY_PLACEHOLDER', 'Con immagine')
        const png = blobFromBase64('${ONE_BY_ONE_PNG_BASE64}')
        const mediaPath = placeImage(pres, slide2, png, {
          filename: 'diagram.png',
          x: 6.0,
          y: 1.5,
          w: 2.0,
          name: 'diagram',
        })
        const out = savePresentation(pres)
        const h = openDocument(out)
        const files = JSON.parse(listFiles(h))
        log('slides=' + getSlideCount(openPresentation(out)))
        log('mediaPath=' + mediaPath)
        log('hasMedia=' + files.includes(mediaPath))
        log('relsHasMedia=' + readXml(h, 'ppt/slides/_rels/slide2.xml.rels').includes('image'))
        log('slideHasPic=' + readXml(h, 'ppt/slides/slide2.xml').includes('<p:pic>'))
        log('slideHasNamespace=' + readXml(h, 'ppt/slides/slide2.xml').includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'))
        log('slideHasText=' + readXml(h, 'ppt/slides/slide2.xml').includes('Con immagine'))
        log('picSquareFromAspect=' + readXml(h, 'ppt/slides/slide2.xml').includes('cx="1828800" cy="1828800"'))
        log('is16x9=' + readXml(h, 'ppt/presentation.xml').includes('<p:sldSz cx="12192000" cy="6858000"/>'))
        log('themeEffectStyles=' + (readXml(h, 'ppt/theme/theme1.xml').match(/<a:effectStyle>/g) || []).length)
        log('themeFills=' + (readXml(h, 'ppt/theme/theme1.xml').match(/<a:fillStyleLst>[\\s\\S]*?<\\/a:fillStyleLst>/)[0].match(/<a:solidFill>|<a:gradFill /g) || []).length)
        const slide1Xml = readXml(h, 'ppt/slides/slide1.xml')
        log('slide1Paragraphs=' + (slide1Xml.match(/<a:p>/g) || []).length)
        log('slide1NoRawNewlineText=' + !slide1Xml.includes('<a:t>Onde elettromagnetiche\\nSeconda riga</a:t>'))
      `)
    const text = textOf(result)
    expect(text).toContain('slides=2')
    expect(text).toContain('hasMedia=true')
    expect(text).toContain('relsHasMedia=true')
    expect(text).toContain('slideHasPic=true')
    expect(text).toContain('slideHasNamespace=true')
    expect(text).toContain('slideHasText=true')
    expect(text).toContain('picSquareFromAspect=true')
    expect(text).toContain('is16x9=true')
    expect(text).toContain('themeEffectStyles=3')
    expect(text).toContain('themeFills=3')
    expect(text).toContain('slide1Paragraphs=3')
    expect(text).toContain('slide1NoRawNewlineText=true')
  }, 30000)

  test('uses the high-level layout slide APIs to avoid text-image overlap', async () => {
    const result = await invokeScript(`
        const pres = createPresentation()
        const slide2 = addSlide(pres)
        setTitleBodySlide(pres, 0, {
          title: 'Copertina',
          body: '- Riga 1\\n  - Sotto riga\\nTesto semplice',
        })
        const png = blobFromBase64('${ONE_BY_ONE_PNG_BASE64}')
        setTitleTextImageSlide(pres, slide2, png, {
          title: 'Maxwell',
          body: 'Punto 1\\nPunto 2\\nPunto 3',
          filename: 'maxwell.png',
          imageSide: 'right',
        })
        const out = savePresentation(pres)
        const h = openDocument(out)
        const slide1Xml = readXml(h, 'ppt/slides/slide1.xml')
        log('titleIsPlaceholder=' + slide1Xml.includes('<p:ph type="title"/>'))
        log('bodyIsPlaceholder=' + slide1Xml.includes('<p:ph type="body" idx="1"/>'))
        log('hasAutofit=' + slide1Xml.includes('<a:normAutofit/>'))
        log('subBulletLevel=' + slide1Xml.includes('<a:pPr lvl="1"/><a:r><a:rPr lang="en-US"/><a:t>Sotto riga</a:t>'))
        log('plainLineNoBullet=' + slide1Xml.includes('<a:pPr marL="0" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>Testo semplice</a:t>'))
        const slide2Xml = readXml(h, 'ppt/slides/slide2.xml')
        log('hasTitle=' + slide2Xml.includes('Maxwell'))
        log('hasBody=' + slide2Xml.includes('Punto 3'))
        log('hasImage=' + slide2Xml.includes('maxwell.png'))
        const boxes = Array.from(slide2Xml.matchAll(/<a:off x="(\\d+)" y="(\\d+)"\\/><a:ext cx="(\\d+)" cy="(\\d+)"\\/>/g))
          .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }))
        const pic = boxes[boxes.length - 1]
        const body = boxes[boxes.length - 2]
        log('noOverlap=' + (body.x + body.w <= pic.x))
        log('imageSquare=' + (pic.w === pic.h))
        log('imageInsideSlide=' + (pic.x + pic.w <= 12192000 && pic.y + pic.h <= 6858000))
      `)
    const text = textOf(result)
    expect(text).toContain('titleIsPlaceholder=true')
    expect(text).toContain('bodyIsPlaceholder=true')
    expect(text).toContain('hasAutofit=true')
    expect(text).toContain('subBulletLevel=true')
    expect(text).toContain('plainLineNoBullet=true')
    expect(text).toContain('hasTitle=true')
    expect(text).toContain('hasBody=true')
    expect(text).toContain('hasImage=true')
    expect(text).toContain('noOverlap=true')
    expect(text).toContain('imageSquare=true')
    expect(text).toContain('imageInsideSlide=true')
  }, 30000)

  test('replaceText rewrites multi-paragraph shapes once and keeps $ sequences literal', async () => {
    const result = await invokeScript(`
        const pres = createPresentation()
        setTitleBodySlide(pres, 0, { title: 'T', body: 'Line 1\\nLine 2' })
        replaceText(pres, 0, 'Line 1Line 2', 'New A\\nNew B')
        replaceText(pres, 0, 'New B', 'Costo $& 100')
        const out = savePresentation(pres)
        const h = openDocument(out)
        const xml = readXml(h, 'ppt/slides/slide1.xml')
        log('countNewA=' + (xml.match(/New A/g) || []).length)
        log('hasDollar=' + xml.includes('Costo $&amp; 100'))
      `)
    const text = textOf(result)
    expect(text).toContain('countNewA=1')
    expect(text).toContain('hasDollar=true')
  }, 30000)

  test('applies green theme and builds a cover slide with image behind the text panel', async () => {
    const result = await invokeScript(`
        const pres = createPresentation()
        applyTheme(pres, { preset: 'green' })
        const png = blobFromBase64('${ONE_BY_ONE_PNG_BASE64}')
        setCoverSlide(pres, 0, png, {
          title: 'Maxwell',
          subtitle: 'Electromagnetism unified',
          filename: 'cover.png',
        })
        const out = savePresentation(pres)
        const h = openDocument(out)
        const themeXml = readXml(h, 'ppt/theme/theme1.xml')
        const slideXml = readXml(h, 'ppt/slides/slide1.xml')
        log('greenAccent=' + themeXml.includes('<a:accent1><a:srgbClr val="2F6B57"/></a:accent1>'))
        log('hasPanel=' + slideXml.includes('name="panel"'))
        log('coverImageBehindPanel=' + (slideXml.indexOf('<p:pic>') < slideXml.indexOf('name="panel"')))
        log('hasTitle=' + slideXml.includes('Maxwell'))
      `)
    const text = textOf(result)
    expect(text).toContain('greenAccent=true')
    expect(text).toContain('hasPanel=true')
    expect(text).toContain('coverImageBehindPanel=true')
    expect(text).toContain('hasTitle=true')
  }, 30000)

  test('supports backgrounds, free text boxes, decorative shapes, tables, and custom theme fonts', async () => {
    const result = await invokeScript(`
        const pres = createPresentation()
        applyTheme(pres, {
          palette: {
            accent1: '2B6E5B',
            accent2: '7FB38A',
            accent3: 'DCEFD9',
            accent4: 'A3C9A8',
            accent5: '1C4A3A',
            accent6: '4D8C73',
            dark: '0F2B22',
            light: 'F5FBF4',
          },
          fonts: {
            heading: 'Georgia',
            body: 'Calibri',
          },
        })
        setTitleBodySlide(pres, 0, {
          title: 'Maxwell at a glance',
          body: '- Four coupled laws\\n- Electricity and magnetism unified',
        })
        setSlideBackground(pres, 0, {
          type: 'gradient',
          stops: [
            { color: '163328', pos: 0 },
            { color: '2F6B57', pos: 100000 },
          ],
        })
        addShape(pres, 0, {
          kind: 'roundRect',
          x: 0.7, y: 1.55, w: 5.7, h: 4.65,
          fill: 'F4FAF2',
          lineColor: '2F6B57',
          lineWidthPt: 1.5,
          shadow: true,
        })
        addTextBox(pres, 0, {
          text: 'c = 3×10^8 m/s',
          x: 8.15, y: 1.55, w: 4.0, h: 1.2,
          fontPt: 24,
          bold: true,
          color: 'scheme:light1',
          align: 'center',
          valign: 'middle',
          fill: '0F3B2E',
          fillAlphaPct: 92,
          shadow: true,
        })
        addTable(pres, 0, {
          x: 7.15, y: 3.15, w: 5.0, h: 2.2,
          rows: [
            ['Law', 'Field'],
            ['Gauss', 'E'],
            ['Faraday', 'B -> E'],
          ],
          headerFill: '2F6B57',
          headerTextColor: 'scheme:light1',
          bodyFill: 'F4FAF2',
          bandedFill: 'E2F0E3',
          fontPt: 14,
        })
        const out = savePresentation(pres)
        const h = openDocument(out)
        const themeXml = readXml(h, 'ppt/theme/theme1.xml')
        const slideXml = readXml(h, 'ppt/slides/slide1.xml')
        log('customHeadingFont=' + themeXml.includes('<a:majorFont><a:latin typeface="Georgia"/>'))
        log('customBodyFont=' + themeXml.includes('<a:minorFont><a:latin typeface="Calibri"/>'))
        log('hasGradientBg=' + slideXml.includes('<p:bg><p:bgPr><a:gradFill'))
        log('hasRoundRect=' + slideXml.includes('prst="roundRect"'))
        log('hasTextBox=' + slideXml.includes('c = 3×10^8 m/s'))
        log('hasTable=' + slideXml.includes('<a:tbl>'))
        log('hasHeaderFill=' + slideXml.includes('<a:tcPr><a:solidFill><a:srgbClr val="2F6B57"></a:srgbClr></a:solidFill></a:tcPr>'))
      `)
    const text = textOf(result)
    expect(text).toContain('customHeadingFont=true')
    expect(text).toContain('customBodyFont=true')
    expect(text).toContain('hasGradientBg=true')
    expect(text).toContain('hasRoundRect=true')
    expect(text).toContain('hasTextBox=true')
    expect(text).toContain('hasTable=true')
    expect(text).toContain('hasHeaderFill=true')
  }, 30000)
})

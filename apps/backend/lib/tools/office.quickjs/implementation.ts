import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { OfficeQuickJsInterface, OfficeQuickJsSchema } from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import { materializeFile } from '@/backend/lib/files/materialize'
import { resolveFileOwner } from '@/backend/lib/tools/ownership'
import { getFileWithId } from '@/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { storage } from '@/lib/storage'
import { findExtractor } from '@/lib/textextraction'
import { lookup as mimeLookup } from 'mime-types'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
// Static import: a runtime dynamic import can deadlock forever under tsx watch
// (module-hooks worker wedge), pinning every office_script call on a dead promise.
import { newAsyncContext } from 'quickjs-emscripten'

const presentationXmlPath = 'ppt/presentation.xml'
const presentationRelsPath = 'ppt/_rels/presentation.xml.rels'
const contentTypesPath = '[Content_Types].xml'
const emuPerInch = 914400

// Slide dimensions in inches
type SlideSize = {
  w: number
  h: number
}

const defaultSlideSize: SlideSize = { w: 13.333, h: 7.5 }

type SlideRect = {
  x: number
  y: number
  w: number
  h: number
}

const getSlideSize = async (zip: JSZip): Promise<SlideSize> => {
  const presentationXml = await getRequiredPresentationPart(zip, presentationXmlPath)
  const sldSzTag = presentationXml.match(/<p:sldSz\b[^>]*>/)?.[0]
  const cx = sldSzTag?.match(/\bcx="(\d+)"/)?.[1]
  const cy = sldSzTag?.match(/\bcy="(\d+)"/)?.[1]
  if (!cx || !cy) return defaultSlideSize
  return { w: Number.parseInt(cx, 10) / emuPerInch, h: Number.parseInt(cy, 10) / emuPerInch }
}

// Title/body areas as fractions of the actual slide size, so layouts scale to
// any deck (4:3, 16:9, custom) instead of assuming a 10-inch-wide slide.
const standardSlideRects = (size: SlideSize) => {
  const marginX = size.w * 0.06
  const titleY = size.h * 0.06
  const titleH = size.h * 0.15
  const bodyY = titleY + titleH + size.h * 0.04
  const bodyH = size.h * 0.93 - bodyY
  return {
    title: { x: marginX, y: titleY, w: size.w - 2 * marginX, h: titleH },
    body: { x: marginX, y: bodyY, w: size.w - 2 * marginX, h: bodyH },
  }
}

// Pixel dimensions read from the image header (PNG, JPEG, GIF)
const getImageSize = (buf: Buffer): { w: number; h: number } | undefined => {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  }
  if (buf.length >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = buf[offset + 1]!
      // SOF0-SOF15 carry dimensions, except DHT (C4), JPG (C8) and DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(offset + 5), w: buf.readUInt16BE(offset + 7) }
      }
      if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd9)) {
        offset++
        continue
      }
      offset += 2 + buf.readUInt16BE(offset + 2)
    }
  }
  return undefined
}

// Largest rect with the given aspect ratio that fits in `bounds`, centered
const fitRectPreservingAspect = (bounds: SlideRect, image: { w: number; h: number }): SlideRect => {
  if (image.w <= 0 || image.h <= 0) return bounds
  const aspect = image.w / image.h
  let w = bounds.w
  let h = w / aspect
  if (h > bounds.h) {
    h = bounds.h
    w = h * aspect
  }
  return { x: bounds.x + (bounds.w - w) / 2, y: bounds.y + (bounds.h - h) / 2, w, h }
}

type StandardSlideSpec = {
  title: string
  body: string
  titleRect?: SlideRect
  bodyRect?: SlideRect
  titleFontPt?: number
  bodyFontPt?: number
}

type ThemePalette = {
  accent1: string
  accent2: string
  accent3: string
  accent4: string
  accent5: string
  accent6: string
  dark: string
  light: string
}

type ThemeFonts = {
  heading?: string
  body?: string
}

const slideRelsPath = (slidePath: string) =>
  slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'

const parsePresentationRelationships = (relsXml: string) => {
  const relationships = new Map<string, string>()
  const regex = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g
  for (const match of relsXml.matchAll(regex)) {
    relationships.set(match[1]!, match[2]!)
  }
  return relationships
}

type SlideEntry = {
  slideId: number
  relationshipId: string
  path: string
}

const dumpJsonish = (vm: Awaited<ReturnType<typeof newAsyncContext>>, handle: any) => {
  return vm.dump(handle) as unknown
}

const getPresentationSlides = (presentationXml: string, relsXml: string): SlideEntry[] => {
  const relationships = parsePresentationRelationships(relsXml)
  const slides: SlideEntry[] = []
  const slideRegex = /<p:sldId\b[^>]*\bid="(\d+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g
  for (const match of presentationXml.matchAll(slideRegex)) {
    const relationshipId = match[2]!
    const target = relationships.get(relationshipId)
    if (!target) continue
    slides.push({
      slideId: Number.parseInt(match[1]!, 10),
      relationshipId,
      path: `ppt/${target.replace(/^\/+/, '')}`,
    })
  }
  return slides
}

const decodeXmlText = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const encodeXmlText = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const splitTextLines = (text: string) => text.replace(/\r\n?/g, '\n').split('\n')

const fontSizeAttr = (fontPt?: number) => (fontPt ? ` sz="${Math.round(fontPt * 100)}"` : '')

const buildTitleParagraphsXml = (text: string, fontPt?: number) => {
  const sz = fontSizeAttr(fontPt)
  return splitTextLines(text)
    .map((line) =>
      line.length === 0
        ? '<a:p><a:endParaRPr lang="en-US"/></a:p>'
        : `<a:p><a:r><a:rPr lang="en-US"${sz}/><a:t>${encodeXmlText(line)}</a:t></a:r></a:p>`
    )
    .join('')
}

// Body text conventions: a leading "-", "*" or "•" makes the line a bullet
// (inheriting the bullet style from the layout/master); two leading spaces per
// nesting step select deeper outline levels; other lines render with no bullet.
const buildBodyParagraphsXml = (text: string, fontPt?: number) => {
  const sz = fontSizeAttr(fontPt)
  return splitTextLines(text)
    .map((rawLine) => {
      if (rawLine.trim().length === 0) {
        return '<a:p><a:endParaRPr lang="en-US"/></a:p>'
      }
      const match = rawLine.match(/^([ \t]*)(?:([-*•])\s+)?(.*)$/)!
      const indentWidth = match[1]!.replace(/\t/g, '  ').length
      const level = Math.min(4, Math.floor(indentWidth / 2))
      const isBullet = match[2] !== undefined
      const lvlAttr = level > 0 ? ` lvl="${level}"` : ''
      const pPr = isBullet
        ? level > 0
          ? `<a:pPr${lvlAttr}/>`
          : ''
        : `<a:pPr${lvlAttr} marL="0" indent="0"><a:buNone/></a:pPr>`
      return `<a:p>${pPr}<a:r><a:rPr lang="en-US"${sz}/><a:t>${encodeXmlText(match[3]!)}</a:t></a:r></a:p>`
    })
    .join('')
}

// Replace the whole paragraph block of a txBody with the given text, keeping
// the first paragraph/run properties so the template's formatting survives.
// String slicing (not String.replace with a string) keeps user text containing
// "$&"-style sequences intact.
const replaceTextInTxBody = (txBodyXml: string, replacement: string) => {
  const firstParagraph = txBodyXml.match(/<a:p[ >]/)
  const lastClose = txBodyXml.lastIndexOf('</a:p>')
  if (!firstParagraph || firstParagraph.index === undefined || lastClose < 0) return txBodyXml
  const paragraphBlock = txBodyXml.slice(firstParagraph.index, lastClose + '</a:p>'.length)
  const pPr = paragraphBlock.match(/<a:pPr\b(?:[^>]*\/>|[\s\S]*?<\/a:pPr>)/)?.[0] ?? ''
  const rPr = paragraphBlock.match(/<a:rPr\b(?:[^>]*\/>|[\s\S]*?<\/a:rPr>)/)?.[0] ?? '<a:rPr lang="en-US"/>'
  const paragraphsXml = splitTextLines(replacement)
    .map((line) =>
      line.length === 0
        ? `<a:p>${pPr}<a:endParaRPr lang="en-US"/></a:p>`
        : `<a:p>${pPr}<a:r>${rPr}<a:t>${encodeXmlText(line)}</a:t></a:r></a:p>`
    )
    .join('')
  return (
    txBodyXml.slice(0, firstParagraph.index) +
    paragraphsXml +
    txBodyXml.slice(lastClose + '</a:p>'.length)
  )
}

const rectToXfrmXml = (rect: SlideRect) =>
  `<a:xfrm><a:off x="${Math.round(rect.x * emuPerInch)}" y="${Math.round(
    rect.y * emuPerInch
  )}"/><a:ext cx="${Math.round(rect.w * emuPerInch)}" cy="${Math.round(
    rect.h * emuPerInch
  )}"/></a:xfrm>`

const buildSolidFillXml = (hex: string, alphaPct?: number) => {
  const color = `<a:srgbClr val="${hex.replace(/^#/, '').toUpperCase()}">${
    typeof alphaPct === 'number' ? `<a:alpha val="${Math.round(alphaPct * 1000)}"/>` : ''
  }</a:srgbClr>`
  return `<a:solidFill>${color}</a:solidFill>`
}

const buildGradientFillXml = (stops: Array<{ color: string; pos: number; alphaPct?: number }>, angle = 5400000) => {
  const normalizedStops = stops
    .map((stop) => ({
      color: stop.color.replace(/^#/, '').toUpperCase(),
      pos: Math.max(0, Math.min(100000, Math.round(stop.pos))),
      alphaPct: stop.alphaPct,
    }))
    .sort((a, b) => a.pos - b.pos)
  const stopsXml = normalizedStops
    .map(
      (stop) =>
        `<a:gs pos="${stop.pos}"><a:srgbClr val="${stop.color}">${
          typeof stop.alphaPct === 'number' ? `<a:alpha val="${Math.round(stop.alphaPct * 1000)}"/>` : ''
        }</a:srgbClr></a:gs>`
    )
    .join('')
  return `<a:gradFill rotWithShape="1"><a:gsLst>${stopsXml}</a:gsLst><a:lin ang="${Math.round(angle)}" scaled="0"/></a:gradFill>`
}

const buildFillXml = (
  options:
    | { type: 'solid'; color: string; alphaPct?: number }
    | { type: 'gradient'; stops: Array<{ color: string; pos: number; alphaPct?: number }>; angle?: number }
) => {
  if (options.type === 'gradient') {
    return buildGradientFillXml(options.stops, options.angle)
  }
  return buildSolidFillXml(options.color, options.alphaPct)
}

const toSchemeColorXml = (value: string) =>
  value.startsWith('scheme:')
    ? `<a:schemeClr val="${encodeXmlText(value.slice('scheme:'.length))}"/>`
    : `<a:srgbClr val="${value.replace(/^#/, '').toUpperCase()}"/>`

const buildLineXml = (options?: { color?: string; widthPt?: number; alphaPct?: number; dash?: 'solid' | 'dash' }) => {
  if (!options?.color) return '<a:ln><a:noFill/></a:ln>'
  const width = Math.max(1, Math.round((options.widthPt ?? 1) * 12700))
  return `<a:ln w="${width}">${buildSolidFillXml(options.color, options.alphaPct)}${
    options.dash === 'dash' ? '<a:prstDash val="dash"/>' : '<a:prstDash val="solid"/>'
  }</a:ln>`
}

const buildShapeEffectsXml = (shadow?: boolean) =>
  shadow
    ? '<a:effectLst><a:outerShdw blurRad="45720" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="24000"/></a:srgbClr></a:outerShdw></a:effectLst>'
    : ''

const buildRectShapeXml = (
  id: number,
  name: string,
  rect: SlideRect,
  options: { fill: string; alphaPct?: number; line?: 'none' | string }
) => {
  const lineXml =
    options.line === 'none' || !options.line
      ? '<a:ln><a:noFill/></a:ln>'
      : `<a:ln>${buildSolidFillXml(options.line)}</a:ln>`
  return `<p:sp>
        <p:nvSpPr><p:cNvPr id="${id}" name="${encodeXmlText(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>${rectToXfrmXml(rect)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${buildSolidFillXml(
          options.fill,
          options.alphaPct
        )}${lineXml}</p:spPr>
      </p:sp>`
}

const buildFreeTextShapeXml = (
  id: number,
  options: {
    name?: string
    rect: SlideRect
    text: string
    fontPt?: number
    fontFace?: string
    color?: string
    bold?: boolean
    italic?: boolean
    align?: 'left' | 'center' | 'right'
    valign?: 'top' | 'middle' | 'bottom'
    fill?: string
    fillAlphaPct?: number
    lineColor?: string
    shadow?: boolean
  }
) => {
  const alignMap: Record<string, string> = { left: 'l', center: 'ctr', right: 'r' }
  const anchorMap: Record<string, string> = { top: 't', middle: 'ctr', bottom: 'b' }
  const sz = fontSizeAttr(options.fontPt)
  const typeface = options.fontFace ? ` typeface="${encodeXmlText(options.fontFace)}"` : ''
  const styleAttrs = `${options.bold ? ' b="1"' : ''}${options.italic ? ' i="1"' : ''}`
  const colorXml = options.color ? `<a:solidFill>${toSchemeColorXml(options.color)}</a:solidFill>` : ''
  const paragraphXml = splitTextLines(options.text)
    .map((line) => {
      if (line.trim().length === 0) return '<a:p><a:endParaRPr lang="en-US"/></a:p>'
      const pPr = `<a:pPr algn="${alignMap[options.align ?? 'left']}"/>`
      return `<a:p>${pPr}<a:r><a:rPr lang="en-US"${sz}${styleAttrs}>${colorXml}<a:latin${typeface}/></a:rPr><a:t>${encodeXmlText(
        line
      )}</a:t></a:r></a:p>`
    })
    .join('')
  const fillXml = options.fill ? buildSolidFillXml(options.fill, options.fillAlphaPct) : '<a:noFill/>'
  return `<p:sp>
        <p:nvSpPr><p:cNvPr id="${id}" name="${encodeXmlText(options.name ?? `TextBox ${id}`)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr>${rectToXfrmXml(options.rect)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${buildLineXml(
          options.lineColor ? { color: options.lineColor } : undefined
        )}${buildShapeEffectsXml(options.shadow)}</p:spPr>
        <p:txBody><a:bodyPr wrap="square" anchor="${anchorMap[options.valign ?? 'top']}" lIns="114300" tIns="68580" rIns="114300" bIns="68580"/><a:lstStyle/>${paragraphXml}</p:txBody>
      </p:sp>`
}

const buildPresetShapeXml = (
  id: number,
  options: {
    rect: SlideRect
    kind: 'rect' | 'roundRect' | 'ellipse' | 'line'
    name?: string
    fill?: string
    fillAlphaPct?: number
    lineColor?: string
    lineWidthPt?: number
    lineDash?: 'solid' | 'dash'
    shadow?: boolean
  }
) => {
  const prst = options.kind === 'ellipse' ? 'ellipse' : options.kind === 'roundRect' ? 'roundRect' : options.kind === 'line' ? 'line' : 'rect'
  const fillXml = options.kind === 'line' ? '<a:noFill/>' : options.fill ? buildSolidFillXml(options.fill, options.fillAlphaPct) : '<a:noFill/>'
  return `<p:sp>
        <p:nvSpPr><p:cNvPr id="${id}" name="${encodeXmlText(options.name ?? `Shape ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>${rectToXfrmXml(options.rect)}<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${fillXml}${buildLineXml({
          color: options.lineColor,
          widthPt: options.lineWidthPt,
          dash: options.lineDash,
        })}${buildShapeEffectsXml(options.shadow)}</p:spPr>
      </p:sp>`
}

const buildTableCellXml = (
  text: string,
  options: { fill?: string; textColor?: string; bold?: boolean; fontPt?: number; align?: 'left' | 'center' | 'right' }
) => {
  const sz = fontSizeAttr(options.fontPt)
  const alignMap: Record<string, string> = { left: 'l', center: 'ctr', right: 'r' }
  const colorXml = options.textColor ? `<a:solidFill>${toSchemeColorXml(options.textColor)}</a:solidFill>` : ''
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${alignMap[options.align ?? 'left']}"/><a:r><a:rPr lang="en-US"${sz}${
    options.bold ? ' b="1"' : ''
  }>${colorXml}</a:rPr><a:t>${encodeXmlText(text)}</a:t></a:r></a:p></a:txBody><a:tcPr>${
    options.fill ? buildSolidFillXml(options.fill) : ''
  }</a:tcPr></a:tc>`
}

const buildTableXml = (
  id: number,
  options: {
    rect: SlideRect
    rows: string[][]
    columnWidths?: number[]
    headerFill?: string
    headerTextColor?: string
    bodyFill?: string
    bandedFill?: string
    fontPt?: number
  }
) => {
  const cols = Math.max(0, ...options.rows.map((row) => row.length))
  const columnWeights =
    options.columnWidths && options.columnWidths.length === cols
      ? options.columnWidths
      : new Array(cols).fill(1)
  const totalWeight = columnWeights.reduce((sum, value) => sum + Math.max(value, 0.01), 0)
  const gridXml = columnWeights
    .map((value) => `<a:gridCol w="${Math.round((options.rect.w * emuPerInch * Math.max(value, 0.01)) / totalWeight)}"/>`)
    .join('')
  const rowHeight = options.rows.length > 0 ? Math.round((options.rect.h * emuPerInch) / options.rows.length) : Math.round(0.5 * emuPerInch)
  const rowsXml = options.rows
    .map((row, rowIndex) => {
      const cells = Array.from({ length: cols }, (_, colIndex) => {
        const text = row[colIndex] ?? ''
        return buildTableCellXml(text, {
          fill:
            rowIndex === 0
              ? options.headerFill
              : rowIndex % 2 === 1
                ? options.bodyFill
                : options.bandedFill ?? options.bodyFill,
          textColor: rowIndex === 0 ? options.headerTextColor : undefined,
          bold: rowIndex === 0,
          fontPt: options.fontPt,
          align: colIndex === 0 ? 'left' : 'center',
        })
      }).join('')
      return `<a:tr h="${rowHeight}">${cells}</a:tr>`
    })
    .join('')
  return `<p:graphicFrame>
        <p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
        <p:xfrm><a:off x="${Math.round(options.rect.x * emuPerInch)}" y="${Math.round(
          options.rect.y * emuPerInch
        )}"/><a:ext cx="${Math.round(options.rect.w * emuPerInch)}" cy="${Math.round(
          options.rect.h * emuPerInch
        )}"/></p:xfrm>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr><a:tblGrid>${gridXml}</a:tblGrid>${rowsXml}</a:tbl></a:graphicData></a:graphic>
      </p:graphicFrame>`
}

// Placeholder shapes (p:ph) inherit fonts, colors, bullets and autofit from
// the deck's layout/master/theme — unlike bare text boxes, which render with
// unstyled defaults. The explicit xfrm keeps geometry predictable even when
// the referenced layout has no matching placeholder.
const buildPlaceholderShapeXml = (
  id: number,
  kind: 'title' | 'body',
  rect: SlideRect,
  paragraphsXml: string
) => {
  const ph = kind === 'title' ? '<p:ph type="title"/>' : '<p:ph type="body" idx="1"/>'
  const name = kind === 'title' ? `Title ${id}` : `Content ${id}`
  const anchor = kind === 'title' ? ' anchor="ctr"' : ''
  return `<p:sp>
        <p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr>
        <p:spPr>${rectToXfrmXml(rect)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr${anchor}><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphsXml}</p:txBody>
      </p:sp>`
}

const buildStandardSlideXml = (spec: StandardSlideSpec, size: SlideSize) => {
  const rects = standardSlideRects(size)
  const titleRect = spec.titleRect ?? rects.title
  const bodyRect = spec.bodyRect ?? rects.body
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${buildPlaceholderShapeXml(2, 'title', titleRect, buildTitleParagraphsXml(spec.title, spec.titleFontPt))}
      ${buildPlaceholderShapeXml(3, 'body', bodyRect, buildBodyParagraphsXml(spec.body, spec.bodyFontPt))}
    </p:spTree>
  </p:cSld>
</p:sld>`
}

const buildCoverSlideXml = (
  size: SlideSize,
  options: { title: string; subtitle: string; panelFill?: string }
) => {
  const panelRect = { x: size.w * 0.065, y: size.h * 0.52, w: size.w * 0.54, h: size.h * 0.28 }
  const titleRect = { x: panelRect.x + 0.25, y: panelRect.y + 0.18, w: panelRect.w - 0.5, h: 0.8 }
  const bodyRect = { x: panelRect.x + 0.28, y: panelRect.y + 1.05, w: panelRect.w - 0.56, h: 0.95 }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${buildRectShapeXml(2, 'panel', panelRect, { fill: options.panelFill ?? '0D3B2E', alphaPct: 72, line: 'none' })}
      ${buildPlaceholderShapeXml(3, 'title', titleRect, buildTitleParagraphsXml(options.title, 28))}
      ${buildPlaceholderShapeXml(4, 'body', bodyRect, buildBodyParagraphsXml(options.subtitle, 18))}
    </p:spTree>
  </p:cSld>
</p:sld>`
}

const greenThemePalette: ThemePalette = {
  accent1: '2F6B57',
  accent2: '5C8F6B',
  accent3: '9FC490',
  accent4: 'D9E7C5',
  accent5: '1F4E3D',
  accent6: '7DAF8A',
  dark: '163328',
  light: 'F4FAF2',
}

const applyThemePalette = async (zip: JSZip, palette: ThemePalette, fonts?: ThemeFonts) => {
  const themePath = 'ppt/theme/theme1.xml'
  const themeXml = await getRequiredPresentationPart(zip, themePath)
  let nextXml = themeXml
    .replace(/<a:dk1><a:srgbClr val="[^"]+"\/><\/a:dk1>/, `<a:dk1><a:srgbClr val="${palette.dark}"/></a:dk1>`)
    .replace(/<a:lt1><a:srgbClr val="[^"]+"\/><\/a:lt1>/, `<a:lt1><a:srgbClr val="${palette.light}"/></a:lt1>`)
    .replace(/<a:accent1><a:srgbClr val="[^"]+"\/><\/a:accent1>/, `<a:accent1><a:srgbClr val="${palette.accent1}"/></a:accent1>`)
    .replace(/<a:accent2><a:srgbClr val="[^"]+"\/><\/a:accent2>/, `<a:accent2><a:srgbClr val="${palette.accent2}"/></a:accent2>`)
    .replace(/<a:accent3><a:srgbClr val="[^"]+"\/><\/a:accent3>/, `<a:accent3><a:srgbClr val="${palette.accent3}"/></a:accent3>`)
    .replace(/<a:accent4><a:srgbClr val="[^"]+"\/><\/a:accent4>/, `<a:accent4><a:srgbClr val="${palette.accent4}"/></a:accent4>`)
    .replace(/<a:accent5><a:srgbClr val="[^"]+"\/><\/a:accent5>/, `<a:accent5><a:srgbClr val="${palette.accent5}"/></a:accent5>`)
    .replace(/<a:accent6><a:srgbClr val="[^"]+"\/><\/a:accent6>/, `<a:accent6><a:srgbClr val="${palette.accent6}"/></a:accent6>`)
  if (fonts?.heading) {
    nextXml = nextXml.replace(
      /<a:majorFont><a:latin typeface="[^"]+"\/><a:ea typeface=""\/><a:cs typeface=""\/><\/a:majorFont>/,
      `<a:majorFont><a:latin typeface="${encodeXmlText(fonts.heading)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>`
    )
  }
  if (fonts?.body) {
    nextXml = nextXml.replace(
      /<a:minorFont><a:latin typeface="[^"]+"\/><a:ea typeface=""\/><a:cs typeface=""\/><\/a:minorFont>/,
      `<a:minorFont><a:latin typeface="${encodeXmlText(fonts.body)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>`
    )
  }
  zip.file(themePath, nextXml)
}

const getSlideLayoutRelationshipTarget = (slideRelsXml: string) => {
  const match = slideRelsXml.match(
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bType="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/slideLayout"[^>]*\bTarget="([^"]+)"[^>]*\/>/
  )
  if (!match) {
    throw new Error('Slide layout relationship not found')
  }
  return { id: match[1]!, target: match[2]! }
}

const resetPresentationSlide = async (zip: JSZip, slideIndex: number, spec: StandardSlideSpec) => {
  const { entry } = await getSlideEntry(zip, slideIndex)
  const size = await getSlideSize(zip)
  const currentSlideRelsPath = slideRelsPath(entry.path)
  const slideRelsXml = await getRequiredPresentationPart(zip, currentSlideRelsPath)
  const slideLayout = getSlideLayoutRelationshipTarget(slideRelsXml)
  zip.file(entry.path, buildStandardSlideXml(spec, size))
  zip.file(
    currentSlideRelsPath,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${slideLayout.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="${slideLayout.target}"/>
</Relationships>`
  )
}

const getRequiredPresentationPart = async (zip: JSZip, path: string) => {
  const file = zip.file(path)
  if (!file) throw new Error(`Presentation part not found: ${path}`)
  return file.async('text')
}

const getSlideEntry = async (zip: JSZip, slideIndex: number) => {
  const presentationXml = await getRequiredPresentationPart(zip, presentationXmlPath)
  const relsXml = await getRequiredPresentationPart(zip, presentationRelsPath)
  const slides = getPresentationSlides(presentationXml, relsXml)
  if (slideIndex < 0 || slideIndex >= slides.length) {
    throw new Error(`Invalid slide index: ${slideIndex}`)
  }
  return { slides, presentationXml, relsXml, entry: slides[slideIndex]! }
}

const ensurePresentationDocument = async (zip: JSZip) => {
  await getRequiredPresentationPart(zip, presentationXmlPath)
  await getRequiredPresentationPart(zip, presentationRelsPath)
  await getRequiredPresentationPart(zip, contentTypesPath)
}

const clonePresentationSlide = async (zip: JSZip, slideIndex: number): Promise<number> => {
  const { slides, presentationXml, relsXml, entry } = await getSlideEntry(zip, slideIndex)
  const contentTypesXml = await getRequiredPresentationPart(zip, contentTypesPath)
  const slideNumbers = Object.keys(zip.files)
    .map((path) => path.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10))
  const nextSlideNumber = (slideNumbers.length > 0 ? Math.max(...slideNumbers) : 0) + 1
  const nextRelationshipNumber =
    Math.max(
      0,
      ...Array.from(parsePresentationRelationships(relsXml).keys()).map((id) => {
        const match = id.match(/^rId(\d+)$/)
        return match ? Number.parseInt(match[1], 10) : 0
      })
    ) + 1
  const nextRelationshipId = `rId${nextRelationshipNumber}`
  const nextSlideId = Math.max(255, ...slides.map((slide) => slide.slideId)) + 1
  const nextSlidePath = `ppt/slides/slide${nextSlideNumber}.xml`
  const nextSlideRelsPath = slideRelsPath(nextSlidePath)

  const sourceSlide = zip.file(entry.path)
  if (!sourceSlide) throw new Error(`Source slide not found: ${entry.path}`)
  zip.file(nextSlidePath, await sourceSlide.async('text'))

  const sourceSlideRels = zip.file(slideRelsPath(entry.path))
  if (sourceSlideRels) {
    zip.file(nextSlideRelsPath, await sourceSlideRels.async('text'))
  }

  zip.file(
    presentationRelsPath,
    relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${nextRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${nextSlideNumber}.xml"/></Relationships>`
    )
  )
  zip.file(
    presentationXmlPath,
    presentationXml.replace(
      '</p:sldIdLst>',
      `<p:sldId id="${nextSlideId}" r:id="${nextRelationshipId}"/></p:sldIdLst>`
    )
  )
  zip.file(
    contentTypesPath,
    contentTypesXml.replace(
      '</Types>',
      `<Override PartName="/ppt/slides/slide${nextSlideNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`
    )
  )

  return slides.length
}

const replaceSlideText = async (
  zip: JSZip,
  slideIndex: number,
  replacements: Array<[string, string]>
): Promise<number> => {
  const { entry } = await getSlideEntry(zip, slideIndex)
  const slideFile = zip.file(entry.path)
  if (!slideFile) throw new Error(`Slide not found: ${entry.path}`)
  const slideXml = await slideFile.async('text')
  let changedRuns = 0
  const txBodyRegex = /<p:txBody>([\s\S]*?)<\/p:txBody>/g
  const nextXml = slideXml.replace(txBodyRegex, (txBodyMatch) => {
    const textParts = Array.from(txBodyMatch.matchAll(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/g))
    if (textParts.length === 0) return txBodyMatch
    const fullText = textParts.map((part) => decodeXmlText(part[2]!)).join('')
    const exactReplacement = replacements.find(([from]) => from === fullText)
    if (exactReplacement) {
      changedRuns++
      return replaceTextInTxBody(txBodyMatch, exactReplacement[1])
    }

    let txBodyChanged = false
    const replacedTxBody = txBodyMatch.replace(/<a:t([^>]*)>([\s\S]*?)<\/a:t>/g, (match, attrs, rawText) => {
      const decoded = decodeXmlText(rawText)
      let nextText = decoded
      for (const [from, to] of replacements) {
        nextText = nextText.split(from).join(to)
      }
      if (nextText === decoded) return match
      txBodyChanged = true
      changedRuns++
      return `<a:t${attrs}>${encodeXmlText(nextText)}</a:t>`
    })
    return txBodyChanged ? replacedTxBody : txBodyMatch
  })
  zip.file(entry.path, nextXml)
  return changedRuns
}

const nextNumberForPattern = (paths: string[], regex: RegExp) => {
  return (
    Math.max(
      0,
      ...paths.map((path) => {
        const match = path.match(regex)
        return match ? Number.parseInt(match[1]!, 10) : 0
      })
    ) + 1
  )
}

const nextRelationshipIdFromXml = (relsXml: string) => {
  return `rId${nextNumberForPattern(Array.from(relsXml.matchAll(/Id="rId(\d+)"/g)).map((m) => m[0]), /rId(\d+)/)}`
}

const ensureContentTypeDefault = async (zip: JSZip, extension: string, contentType: string) => {
  const contentTypesXml = await getRequiredPresentationPart(zip, contentTypesPath)
  const defaultPattern = new RegExp(`<Default\\s+Extension="${extension}"\\s+ContentType="[^"]+"\\s*/>`)
  if (defaultPattern.test(contentTypesXml)) return
  zip.file(
    contentTypesPath,
    contentTypesXml.replace(
      '</Types>',
      `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`
    )
  )
}

const createBuiltInPresentationTemplate = async () => {
  const zip = new JSZip()
  const now = new Date().toISOString()
  zip.file(
    contentTypesPath,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
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
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
  )
  zip.file(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Logicle Office QuickJS</Application>
  <PresentationFormat>Widescreen</PresentationFormat>
  <Slides>1</Slides>
  <Notes>0</Notes>
  <HiddenSlides>0</HiddenSlides>
  <MMClips>0</MMClips>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>QuickJS Template</vt:lpstr></vt:vector></TitlesOfParts>
  <AppVersion>1.0</AppVersion>
</Properties>`
  )
  zip.file(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Logicle</dc:creator>
  <cp:lastModifiedBy>Logicle</cp:lastModifiedBy>
  <cp:revision>1</cp:revision>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
  )
  zip.file(
    presentationXmlPath,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle>
</p:presentation>`
  )
  zip.file(
    presentationRelsPath,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>
</Relationships>`
  )
  zip.file(
    'ppt/presProps.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`
  )
  zip.file(
    'ppt/viewProps.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:normalViewPr/><p:slideViewPr><p:cSldViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:cSldViewPr></p:slideViewPr><p:gridSpacing cx="72008" cy="72008"/>
</p:viewPr>`
  )
  zip.file(
    'ppt/tableStyles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`
  )
  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Logicle Theme">
  <a:themeElements>
    <a:clrScheme name="Logicle">
      <a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>
      <a:accent1><a:srgbClr val="156082"/></a:accent1><a:accent2><a:srgbClr val="E97132"/></a:accent2>
      <a:accent3><a:srgbClr val="196B24"/></a:accent3><a:accent4><a:srgbClr val="0F9ED5"/></a:accent4>
      <a:accent5><a:srgbClr val="A02B93"/></a:accent5><a:accent6><a:srgbClr val="4EA72E"/></a:accent6>
      <a:hlink><a:srgbClr val="467886"/></a:hlink><a:folHlink><a:srgbClr val="96607D"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Logicle">
      <a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Logicle">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>
        <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`
  )
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="731520" y="411480"/><a:ext cx="10728960" cy="1005840"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="731520" y="1691640"/><a:ext cx="10728960" cy="4480560"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr algn="l" defTabSz="914400" rtl="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="3600" b="1" kern="1200"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr marL="228600" indent="-228600" algn="l" defTabSz="914400" rtl="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="800"/></a:spcBef><a:buClr><a:schemeClr val="accent1"/></a:buClr><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>
      <a:lvl2pPr marL="685800" indent="-228600" algn="l" defTabSz="914400" rtl="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buClr><a:schemeClr val="accent1"/></a:buClr><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8211;"/><a:defRPr sz="1600" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>
      <a:lvl3pPr marL="1143000" indent="-228600" algn="l" defTabSz="914400" rtl="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buClr><a:schemeClr val="accent1"/></a:buClr><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="1400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>
      <a:lvl4pPr marL="1600200" indent="-228600" algn="l" defTabSz="914400" rtl="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buClr><a:schemeClr val="accent1"/></a:buClr><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8211;"/><a:defRPr sz="1400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>
      <a:lvl5pPr marL="2057400" indent="-228600" algn="l" defTabSz="914400" rtl="0"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="600"/></a:spcBef><a:buClr><a:schemeClr val="accent1"/></a:buClr><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="&#8226;"/><a:defRPr sz="1400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:lvl1pPr defTabSz="914400" rtl="0"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>`
  )
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
  )
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="tx" preserve="1">
  <p:cSld name="Title and Content">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master title style</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
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
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>TITLE_PLACEHOLDER</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>BODY_PLACEHOLDER</a:t></a:r></a:p></p:txBody>
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
  return zip
}

const addPresentationImage = async (
  zip: JSZip,
  slideIndex: number,
  blob: Buffer,
  options: { filename: string; x: number; y: number; w: number; h: number; name?: string }
) => {
  const { entry } = await getSlideEntry(zip, slideIndex)
  const slideFile = zip.file(entry.path)
  if (!slideFile) throw new Error(`Slide not found: ${entry.path}`)
  let slideXml = await slideFile.async('text')
  const currentSlideRelsPath = slideRelsPath(entry.path)
  const slideRelsXml = await getRequiredPresentationPart(zip, currentSlideRelsPath)
  const ext = options.filename.split('.').pop()?.toLowerCase()
  if (!ext) throw new Error(`Unable to determine image extension from "${options.filename}"`)
  const mimeType = (mimeLookup(options.filename) as string | false) || 'application/octet-stream'
  const mediaNumber = nextNumberForPattern(Object.keys(zip.files), /^ppt\/media\/image(\d+)\./)
  const mediaPath = `ppt/media/image${mediaNumber}.${ext}`
  const relId = nextRelationshipIdFromXml(slideRelsXml)
  const shapeId = nextNumberForPattern(
    Array.from(slideXml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)).map((m) => m[0]),
    /id="(\d+)"/
  )
  await ensureContentTypeDefault(zip, ext, mimeType)
  zip.file(mediaPath, blob)
  zip.file(
    currentSlideRelsPath,
    slideRelsXml.replace(
      '</Relationships>',
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${mediaNumber}.${ext}"/></Relationships>`
    )
  )
  const imageName = options.name ?? options.filename
  if (!slideXml.includes('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')) {
    slideXml = slideXml.replace(
      '<p:sld ',
      '<p:sld xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    )
  }
  const picXml = `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="${encodeXmlText(
    imageName
  )}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round(
    options.x * emuPerInch
  )}" y="${Math.round(options.y * emuPerInch)}"/><a:ext cx="${Math.round(
    options.w * emuPerInch
  )}" cy="${Math.round(options.h * emuPerInch)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  // Function replacement: a plain string would mangle "$&"-style sequences in user-provided names
  zip.file(entry.path, slideXml.replace('</p:spTree>', () => `${picXml}</p:spTree>`))
  return mediaPath
}

const sendLastPictureToBack = async (zip: JSZip, slideIndex: number) => {
  const { entry } = await getSlideEntry(zip, slideIndex)
  const slideFile = zip.file(entry.path)
  if (!slideFile) throw new Error(`Slide not found: ${entry.path}`)
  const slideXml = await slideFile.async('text')
  const picMatches = Array.from(slideXml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g))
  const lastPic = picMatches.at(-1)?.[0]
  if (!lastPic) return
  const withoutPic = slideXml.replace(lastPic, '')
  zip.file(
    entry.path,
    withoutPic.replace('<p:spTree>', `<p:spTree>${lastPic}`)
  )
}

const getNextSlideShapeId = (slideXml: string) =>
  nextNumberForPattern(
    Array.from(slideXml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g)).map((m) => m[0]),
    /id="(\d+)"/
  )

const appendSlideFragment = async (zip: JSZip, slideIndex: number, fragmentXml: string) => {
  const { entry } = await getSlideEntry(zip, slideIndex)
  const slideFile = zip.file(entry.path)
  if (!slideFile) throw new Error(`Slide not found: ${entry.path}`)
  const slideXml = await slideFile.async('text')
  zip.file(entry.path, slideXml.replace('</p:spTree>', `${fragmentXml}</p:spTree>`))
}

const setSlideBackground = async (
  zip: JSZip,
  slideIndex: number,
  options:
    | { type: 'solid'; color: string; alphaPct?: number }
    | { type: 'gradient'; stops: Array<{ color: string; pos: number; alphaPct?: number }>; angle?: number }
) => {
  const { entry } = await getSlideEntry(zip, slideIndex)
  const slideFile = zip.file(entry.path)
  if (!slideFile) throw new Error(`Slide not found: ${entry.path}`)
  let slideXml = await slideFile.async('text')
  slideXml = slideXml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, '')
  const bgXml = `<p:bg><p:bgPr>${buildFillXml(options)}<a:effectLst/></p:bgPr></p:bg>`
  slideXml = slideXml.replace('<p:cSld>', `<p:cSld>${bgXml}`)
  zip.file(entry.path, slideXml)
}

export class OfficeQuickJsTool extends OfficeQuickJsInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new OfficeQuickJsTool(toolParams, OfficeQuickJsSchema.parse(params))

  supportedMedia = []

  constructor(
    public toolParams: ToolParams,
    _params: Record<string, never>
  ) {
    super()
  }

  functions = async (_model: LlmModel, _context: ToolFunctionContext): Promise<ToolFunctions> =>
    this.functions_

  functions_: ToolFunctions = {
    office_script: {
      description: `Execute JavaScript in a sandboxed QuickJS VM to create, read, and transform Office documents:
Word (.docx), PowerPoint (.pptx), and Excel (.xlsx).

━━ IMPORTANT: host functions are SYNCHRONOUS — do NOT use await ━━
  (They are async on the host but appear synchronous inside QuickJS via asyncify.)

━━ Blobs ━━

Binary data stays on the host; scripts pass opaque blob ids (strings) around.

  getAttachment(fileId) → blob
    Read an uploaded attachment into a blob.
  blobSize(blob) → number          — size in bytes
  blobFromBase64(base64) → blob    — only when raw bytes must be produced in-script
  blobToBase64(blob) → base64      — only when raw bytes must be inspected in-script

━━ Quick reading (lossy text extraction) ━━

  extractText(blob, filename) → string
    The filename extension selects the converter:
    .docx → Markdown; .xlsx → Markdown tables (one section per sheet);
    .pptx → JSON text dump; .pdf → text.
    Great for reading and summarising. Use the XML functions below for precision.

━━ High-level creation ━━

  createXlsx(specJson) → blob
Preferred way to produce a spreadsheet. specJson is a JSON string:
      { "sheets": [ { "name": "Sales",
                      "rows": [ ["Region","Total"], ["EMEA",1200] ],
                      "columnWidths": [20, 12] } ] }
    Cell values: string | number | boolean | null | { "formula": "SUM(B2:B9)" }.
    For styling beyond this, open the result with openDocument and edit the XML.

━━ High-level PPTX editing (preferred for real decks) ━━

  createPresentation() → handle
    Start from a built-in themed 16:9 PPTX template with one slide containing
    TITLE_PLACEHOLDER / BODY_PLACEHOLDER texts.
  openPresentation(blob) → handle
  createPresentationFromTemplate(blob) → handle
    Open an existing PPTX template and preserve its theme/layout/relationships.
  getSlideCount(handle) → number
  addSlide(handle) → newSlideIndex
    Clone the last slide in the deck.
  cloneSlide(handle, slideIndex) → newSlideIndex
    Duplicate an existing slide at the end of the deck, copying its rels too.
  replaceText(handle, slideIndex, search, replace) → changedRunCount
  replaceAllText(handle, slideIndex, replacements) → changedRunCount
    slideIndex is zero-based. Keeps the original formatting; a replacement with
    \\n produces multiple paragraphs.
    replacements can be either a JS object or a JSON string:
      { "TITLE_PLACEHOLDER": "Equazioni di Maxwell",
        "BODY_PLACEHOLDER": "Testo..." }
  setTitleBodySlide(handle, slideIndex, options) → slideIndex
    Replace the slide with a standard title/body layout. The shapes are real
    placeholders: they pick up fonts/colors/bullets from the deck's theme and
    auto-shrink text that overflows. Geometry adapts to the deck's slide size.
    Body text conventions (also for setTitleTextImageSlide):
      "- " or "* " prefix → bullet; two leading spaces per extra nesting level
      ("  - " → sub-bullet); plain lines render without a bullet.
    options can be either a JS object or a JSON string:
      { "title": "Le Equazioni di Maxwell",
        "body": "- Punto 1\\n- Punto 2\\n  - Dettaglio" }
  setTitleTextImageSlide(handle, slideIndex, blob, options) → mediaPath
    Replace the slide with a standard title + text + image layout. The image
    keeps its aspect ratio (PNG/JPEG/GIF), centered in its column.
    options:
      { "title": "Le 4 Equazioni",
        "body": "Punto 1\\nPunto 2",
        "filename": "diagram.png",
        "imageSide": "right" }   // "right" default, or "left"
  setCoverSlide(handle, slideIndex, blob, options) → mediaPath
    Replace the slide with a full-bleed image cover and a translucent title panel.
    options:
      { "title": "Maxwell's Equations",
        "subtitle": "The laws that govern electromagnetism",
        "filename": "cover.png" }
  applyTheme(handle, options) → handle
    Apply a presentation palette/font pairing. Current presets:
      { "preset": "green" } or { "preset": "default" }
    Or provide a custom palette + fonts:
      { "palette": { "accent1": "2F6B57", ..., "dark": "163328", "light": "F4FAF2" },
        "fonts": { "heading": "Aptos Display", "body": "Aptos" } }
  setSlideBackground(handle, slideIndex, options) → slideIndex
    Set a solid or gradient slide background:
      { "type": "solid", "color": "0F3B2E" }
      { "type": "gradient",
        "stops": [{ "color": "163328", "pos": 0 }, { "color": "2F6B57", "pos": 100000 }],
        "angle": 5400000 }
  addTextBox(handle, slideIndex, options) → shapeId
    Add a free-positioned text box:
      { "text": "Big number\\n3×10^8 m/s",
        "x": 7.9, "y": 1.2, "w": 4.0, "h": 1.6,
        "fontPt": 24, "bold": true, "color": "scheme:light1",
        "align": "center", "valign": "middle",
        "fill": "0F3B2E", "fillAlphaPct": 92, "shadow": true }
  addShape(handle, slideIndex, options) → shapeId
    Add a rect / roundRect / ellipse / line:
      { "kind": "roundRect", "x": 0.8, "y": 1.4, "w": 5.4, "h": 4.7,
        "fill": "F4FAF2", "lineColor": "2F6B57", "lineWidthPt": 1.5, "shadow": true }
  addTable(handle, slideIndex, options) → shapeId
    Add a simple styled table:
      { "x": 0.9, "y": 1.8, "w": 11.4, "h": 3.6,
        "rows": [["Law","Equation"],["Gauss","∇·E = ρ/ε₀"]],
        "headerFill": "2F6B57", "headerTextColor": "scheme:light1",
        "bodyFill": "F4FAF2", "bandedFill": "E7F1E7" }
  placeImage(handle, slideIndex, blob, options) → mediaPath
    options can be either a JS object or a JSON string. Example:
      { "filename": "diagram.png", "x": 6.2, "y": 1.8, "w": 3.0 }
    Coordinates are in inches from the top-left corner of the slide.
    Provide w and/or h; omit one to derive it from the image's aspect ratio.
  savePresentation(handle) → blob

━━ Deck design guidance (important) ━━

Do not make every slide title + bullets + image. Vary the composition.
Use at least one visual element on every slide: image, panel, shape, quote block, stat card, or table.
Prefer 28–36pt+ titles, 16–22pt body, and short bullets (4–6 per slide).
Use full-bleed covers, colored panels, and custom backgrounds for section changes or emphasis.
For “nice looking” decks, combine:
  applyTheme(...) + setCoverSlide(...) + setSlideBackground(...) + addShape(...) + addTextBox(...)
Use high-level layout functions for structure, then layer decorative shapes/text boxes on top.

━━ OOXML ZIP/XML access (full power; works for all three formats) ━━

A .docx/.pptx/.xlsx file is a ZIP archive whose content lives in XML parts.

  openDocument(blob) → handle (integer)
    Open a document. Multiple documents can be open simultaneously.
  newDocument() → handle
    Start from an empty archive — for building a document fully from scratch
    (remember [Content_Types].xml and _rels/.rels).
  listFiles(handle) → JSON string (string[])    — part paths inside the ZIP
  readXml(handle, path) → XML string            — read a text/XML part
  writeXml(handle, path, xmlString)             — write/replace a text/XML part
  readPart(handle, path) → blob                 — read a binary part (e.g. word/media/image1.png)
  writePart(handle, path, blob)                 — write/replace a binary part
  removePart(handle, path)                      — delete a part
  saveDocument(handle) → blob                   — repack the ZIP; the handle is disposed

━━ Word structure (word/document.xml) ━━

Namespaces: w: (WordprocessingML), r: (relationships). Already declared in any real .docx.
Other parts: word/_rels/document.xml.rels (rIds → hyperlink URLs), word/styles.xml,
word/numbering.xml, [Content_Types].xml.

  <w:body>
    <w:p>                        ← paragraph
      <w:pPr>                    ← paragraph properties
        <w:pStyle w:val="Heading1"/>
        <w:jc w:val="center"/>         ← alignment: left|center|right|both
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>  ← list item
      </w:pPr>
      <w:r>                      ← run (inline text)
        <w:rPr>                  ← <w:b/> bold, <w:i/> italic, <w:u w:val="single"/>,
                                   <w:color w:val="FF0000"/>, <w:sz w:val="24"/> (half-points)
        </w:rPr>
        <w:t xml:space="preserve">Hello world</w:t>
      </w:r>
      <w:hyperlink r:id="rId1"><w:r><w:t>click here</w:t></w:r></w:hyperlink>
    </w:p>
    <w:tbl><w:tr><w:tc><w:p>...</w:p></w:tc></w:tr></w:tbl>   ← table/row/cell
    <w:sectPr/>                  ← page setup — keep as-is at end of body
  </w:body>

Preserve xml:space="preserve" on <w:t> when text has leading/trailing spaces.

━━ PowerPoint structure (ppt/**) ━━

Key parts:
  ppt/presentation.xml             — slide order: <p:sldIdLst><p:sldId id="256" r:id="rId1"/>...
  ppt/_rels/presentation.xml.rels  — rIds → slides/slideN.xml
  ppt/slides/slideN.xml            — slide content
  ppt/slides/_rels/slideN.xml.rels — the slide's images and layout relationships
  [Content_Types].xml              — must contain an Override for every slide part

Slide content (namespaces p:, a:, r:):
  <p:sld><p:cSld><p:spTree>
    <p:sp>                       ← shape (text box / placeholder)
      <p:nvSpPr>...<p:ph type="title|body|ctrTitle"/>...</p:nvSpPr>
      <p:txBody>
        <a:p><a:r><a:rPr lang="en-US" sz="2400" b="1"/><a:t>text here</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
    <p:pic>...</p:pic>           ← image (r:embed points to a rel in the slide's .rels)
  </p:spTree></p:cSld></p:sld>

All visible text lives in <a:t>. Font size sz is in hundredths of a point (2400 = 24pt).
Prefer editing a template deck over building a .pptx from scratch. To add a slide, clone one:
  1. write the new slide XML to ppt/slides/slideN.xml (N unused)
  2. copy its rels file to ppt/slides/_rels/slideN.xml.rels
  3. add an <Override> for it in [Content_Types].xml
  4. add a <Relationship> in ppt/_rels/presentation.xml.rels (new unique rId)
  5. append <p:sldId id="..." r:id="..."/> to <p:sldIdLst> (id unique, ≥ 256)

━━ Excel raw XML (xl/**) ━━

Key parts: xl/workbook.xml (sheet names → r:id), xl/_rels/workbook.xml.rels,
xl/worksheets/sheetN.xml (cells), xl/sharedStrings.xml (shared string table).

  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>     ← t="s": <v> is an index into sharedStrings.xml
      <c r="B1"><v>42</v></c>          ← no t: number
    </row>
  </sheetData>

When editing cells, the simplest reliable form is an inline string — it avoids maintaining
sharedStrings.xml:  <c r="A2" t="inlineStr"><is><t>text</t></is></c>
When adding cells outside the current range, update <dimension ref="A1:B2"/> accordingly —
readers may ignore cells beyond it.
Prefer createXlsx() for new files; use raw XML to edit existing ones.

━━ Output ━━

  addOutput(blob, filename) → fileId
    Persist a blob and attach it to the tool result. MIME type inferred from the extension.
    Call multiple times to emit multiple output files. Optional — scripts that only read are valid.
  log(message)
    Append a debug message to the tool response.

━━ Examples ━━

Fill a Word template:
  const h = openDocument(getAttachment(fileId))
  var xml = readXml(h, 'word/document.xml')
  xml = xml.replace(/<w:t([^>]*)>CUSTOMER_NAME<\\/w:t>/g,
                    '<w:t$1>Acme Corp<\\/w:t>')
  writeXml(h, 'word/document.xml', xml)
  addOutput(saveDocument(h), 'filled.docx')

Create a spreadsheet:
  const blob = createXlsx(JSON.stringify({ sheets: [{ name: 'Q1',
    rows: [['Region','Sales'], ['EMEA', 1200], ['APAC', 900],
           ['Total', { formula: 'SUM(B2:B3)' }]] }] }))
  addOutput(blob, 'report.xlsx')`,

      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'JavaScript to execute. Call addOutput(blob, filename) to produce output files. Omitting it is valid when the script only reads or inspects documents.',
          },
        },
        required: ['code'],
        additionalProperties: false,
      },

      invoke: async (invokeParams): Promise<dto.ToolCallResultOutput> => {
        const code = String(invokeParams.params.code ?? '')

        type OutputEntry = {
          type: 'file'
          id: string
          mimetype: string
          name: string
          size: number
        }

        const outputEntries: OutputEntry[] = []
        const logs: string[] = []

        try {
          await runInQuickJs(code, invokeParams, outputEntries, logs)
        } catch (err) {
          return {
            type: 'error-text',
            value: `Script error: ${err instanceof Error ? err.message : String(err)}`,
          }
        }

        const logNote = logs.length > 0 ? `\nLog:\n${logs.map((l) => `  ${l}`).join('\n')}` : ''

        if (outputEntries.length === 0) {
          return {
            type: 'content',
            value: [
              {
                type: 'text',
                text: 'Script completed without producing output files.' + logNote,
              },
            ],
          }
        }

        return {
          type: 'content',
          value: [
            {
              type: 'text',
              text:
                `Produced ${outputEntries.length} file(s): ` +
                outputEntries.map((e) => `"${e.name}" (${e.size} bytes)`).join(', ') +
                '.' +
                logNote,
            },
            ...outputEntries,
          ],
        }
      },
    },
  }
}

// ---------------------------------------------------------------------------
// QuickJS execution
// ---------------------------------------------------------------------------

async function runInQuickJs(
  userCode: string,
  invokeParams: ToolInvokeParams,
  outputEntries: Array<{
    type: 'file'
    id: string
    mimetype: string
    name: string
    size: number
  }>,
  logs: string[]
): Promise<void> {
  // newAsyncContext() enables newAsyncifiedFunction — host async functions
  // appear synchronous inside the QuickJS script (asyncify transform).
  const vm = await newAsyncContext()

  // Open documents keyed by integer handle
  const openDocs = new Map<number, JSZip>()
  let nextDocHandle = 1

  // Binary data stays host-side; scripts hold opaque blob ids
  const blobs = new Map<string, Buffer>()
  let nextBlobId = 1
  const putBlob = (buf: Buffer): string => {
    const id = `blob:${nextBlobId++}`
    blobs.set(id, buf)
    return id
  }
  const getBlob = (id: string): Buffer => {
    const buf = blobs.get(id)
    if (!buf) throw new Error(`Invalid blob id: ${id}`)
    return buf
  }
  const getDoc = (handle: number): JSZip => {
    const zip = openDocs.get(handle)
    if (!zip) throw new Error(`Invalid document handle: ${handle}`)
    return zip
  }

  const reg = <T>(name: string, fn: (...a: any[]) => T) => {
    const h =
      fn.length === 0 ? vm.newFunction(name, fn as any) : vm.newAsyncifiedFunction(name, fn as any)
    vm.setProp(vm.global, name, h)
    h.dispose()
  }

  try {
    // ── log(message) ───────────────────────────────────────────────────────
    const logFn = vm.newFunction('log', (msgHandle) => {
      logs.push(String(vm.dump(msgHandle)))
    })
    vm.setProp(vm.global, 'log', logFn)
    logFn.dispose()

    // ── getAttachment(fileId) → blob ───────────────────────────────────────
    reg('getAttachment', async (fileIdHandle: any) => {
      const fileId = String(vm.dump(fileIdHandle))
      const fileEntry = await getFileWithId(fileId)
      if (!fileEntry) throw new Error(`File not found: ${fileId}`)
      if (!(await canAccessFile({ userId: invokeParams.userId }, fileId))) {
        throw new Error(`Access denied: ${fileId}`)
      }
      const bytes = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
      return vm.newString(putBlob(bytes))
    })

    // ── blob helpers ───────────────────────────────────────────────────────
    reg('blobSize', async (blobHandle: any) => {
      return vm.newNumber(getBlob(String(vm.dump(blobHandle))).byteLength)
    })

    reg('blobFromBase64', async (base64Handle: any) => {
      return vm.newString(putBlob(Buffer.from(String(vm.dump(base64Handle)), 'base64')))
    })

    reg('blobToBase64', async (blobHandle: any) => {
      return vm.newString(getBlob(String(vm.dump(blobHandle))).toString('base64'))
    })

    // ── openDocument(blob) → handle ────────────────────────────────────────
    reg('openDocument', async (blobHandle: any) => {
      const zip = await JSZip.loadAsync(getBlob(String(vm.dump(blobHandle))))
      const handle = nextDocHandle++
      openDocs.set(handle, zip)
      return vm.newNumber(handle)
    })

    // ── openPresentation(blob) / createPresentationFromTemplate(blob) ──────
    reg('openPresentation', async (blobHandle: any) => {
      const zip = await JSZip.loadAsync(getBlob(String(vm.dump(blobHandle))))
      await ensurePresentationDocument(zip)
      const handle = nextDocHandle++
      openDocs.set(handle, zip)
      return vm.newNumber(handle)
    })

    reg('createPresentationFromTemplate', async (blobHandle: any) => {
      const zip = await JSZip.loadAsync(getBlob(String(vm.dump(blobHandle))))
      await ensurePresentationDocument(zip)
      const handle = nextDocHandle++
      openDocs.set(handle, zip)
      return vm.newNumber(handle)
    })

    const createPresentationFn = vm.newAsyncifiedFunction('createPresentation', async () => {
      const zip = await createBuiltInPresentationTemplate()
      const handle = nextDocHandle++
      openDocs.set(handle, zip)
      return vm.newNumber(handle)
    })
    vm.setProp(vm.global, 'createPresentation', createPresentationFn)
    createPresentationFn.dispose()

    // ── newDocument() → handle ─────────────────────────────────────────────
    const newDocumentFn = vm.newFunction('newDocument', () => {
      const handle = nextDocHandle++
      openDocs.set(handle, new JSZip())
      return vm.newNumber(handle)
    })
    vm.setProp(vm.global, 'newDocument', newDocumentFn)
    newDocumentFn.dispose()

    // ── listFiles(handle) → JSON string ────────────────────────────────────
    reg('listFiles', async (handleHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir)
      return vm.newString(JSON.stringify(paths))
    })

    // ── readXml(handle, path) → XML string ────────────────────────────────
    reg('readXml', async (handleHandle: any, pathHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const path = String(vm.dump(pathHandle))
      const file = zip.file(path)
      if (!file) throw new Error(`File not found in document: ${path}`)
      const content = await file.async('text')
      return vm.newString(content)
    })

    // ── writeXml(handle, path, xmlString) ─────────────────────────────────
    reg('writeXml', async (handleHandle: any, pathHandle: any, contentHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const path = String(vm.dump(pathHandle))
      const content = String(vm.dump(contentHandle))
      zip.file(path, content)
      return vm.undefined
    })

    // ── readPart(handle, path) → blob ──────────────────────────────────────
    reg('readPart', async (handleHandle: any, pathHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const path = String(vm.dump(pathHandle))
      const file = zip.file(path)
      if (!file) throw new Error(`File not found in document: ${path}`)
      return vm.newString(putBlob(await file.async('nodebuffer')))
    })

    // ── writePart(handle, path, blob) ──────────────────────────────────────
    reg('writePart', async (handleHandle: any, pathHandle: any, blobHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const path = String(vm.dump(pathHandle))
      zip.file(path, getBlob(String(vm.dump(blobHandle))))
      return vm.undefined
    })

    // ── removePart(handle, path) ───────────────────────────────────────────
    reg('removePart', async (handleHandle: any, pathHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      zip.remove(String(vm.dump(pathHandle)))
      return vm.undefined
    })

    // ── saveDocument(handle) → blob ────────────────────────────────────────
    reg('saveDocument', async (handleHandle: any) => {
      const handle = Number(vm.dump(handleHandle))
      const zip = getDoc(handle)
      openDocs.delete(handle)
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      return vm.newString(putBlob(buf))
    })

    // ── PPTX helpers ────────────────────────────────────────────────────────
    reg('getSlideCount', async (handleHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const presentationXml = await getRequiredPresentationPart(zip, presentationXmlPath)
      const relsXml = await getRequiredPresentationPart(zip, presentationRelsPath)
      return vm.newNumber(getPresentationSlides(presentationXml, relsXml).length)
    })

    reg('cloneSlide', async (handleHandle: any, slideIndexHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      return vm.newNumber(await clonePresentationSlide(zip, slideIndex))
    })

    reg('addSlide', async (handleHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const presentationXml = await getRequiredPresentationPart(zip, presentationXmlPath)
      const relsXml = await getRequiredPresentationPart(zip, presentationRelsPath)
      const slideCount = getPresentationSlides(presentationXml, relsXml).length
      return vm.newNumber(await clonePresentationSlide(zip, slideCount - 1))
    })

    reg('replaceText', async (handleHandle: any, slideIndexHandle: any, fromHandle: any, toHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const from = String(vm.dump(fromHandle))
      const to = String(vm.dump(toHandle))
      return vm.newNumber(await replaceSlideText(zip, slideIndex, [[from, to]]))
    })

    reg('replaceAllText', async (handleHandle: any, slideIndexHandle: any, replacementsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const dumped = dumpJsonish(vm, replacementsHandle)
      const replacementsObject =
        typeof dumped === 'string' ? (JSON.parse(dumped) as Record<string, unknown>) : (dumped as Record<string, unknown>)
      const replacements: Array<[string, string]> = Object.entries(replacementsObject).map(([from, to]) => [
        from,
        String(to),
      ])
      return vm.newNumber(await replaceSlideText(zip, slideIndex, replacements))
    })

    reg('setTitleBodySlide', async (handleHandle: any, slideIndexHandle: any, optionsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const dumped = dumpJsonish(vm, optionsHandle)
      const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as {
        title?: string
        body?: string
      }
      if (typeof options.title !== 'string') throw new Error('setTitleBodySlide: options.title is required')
      if (typeof options.body !== 'string') throw new Error('setTitleBodySlide: options.body is required')
      await resetPresentationSlide(zip, slideIndex, {
        title: options.title,
        body: options.body,
      })
      return vm.newNumber(slideIndex)
    })

    reg('applyTheme', async (handleHandle: any, optionsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const dumped = dumpJsonish(vm, optionsHandle)
      const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as {
        preset?: string
        palette?: Partial<ThemePalette>
        fonts?: ThemeFonts
      }
      const preset = options.preset ?? 'default'
      if (preset === 'green') {
        await applyThemePalette(zip, greenThemePalette, options.fonts)
      } else if (preset !== 'default') {
        throw new Error(`applyTheme: unknown preset "${preset}"`)
      }
      if (options.palette) {
        const palette: ThemePalette = {
          accent1: options.palette.accent1 ?? greenThemePalette.accent1,
          accent2: options.palette.accent2 ?? greenThemePalette.accent2,
          accent3: options.palette.accent3 ?? greenThemePalette.accent3,
          accent4: options.palette.accent4 ?? greenThemePalette.accent4,
          accent5: options.palette.accent5 ?? greenThemePalette.accent5,
          accent6: options.palette.accent6 ?? greenThemePalette.accent6,
          dark: options.palette.dark ?? greenThemePalette.dark,
          light: options.palette.light ?? greenThemePalette.light,
        }
        await applyThemePalette(zip, palette, options.fonts)
      }
      return vm.newNumber(Number(vm.dump(handleHandle)))
    })

    reg('setSlideBackground', async (handleHandle: any, slideIndexHandle: any, optionsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const dumped = dumpJsonish(vm, optionsHandle)
      const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as
        | { type?: 'solid'; color?: string; alphaPct?: number }
        | { type?: 'gradient'; stops?: Array<{ color: string; pos: number; alphaPct?: number }>; angle?: number }
      if (options.type === 'gradient') {
        if (!Array.isArray(options.stops) || options.stops.length < 2) {
          throw new Error('setSlideBackground: gradient requires at least two stops')
        }
        await setSlideBackground(zip, slideIndex, { type: 'gradient', stops: options.stops, angle: options.angle })
      } else {
        if (!('color' in options) || typeof options.color !== 'string') {
          throw new Error('setSlideBackground: solid background requires options.color')
        }
        await setSlideBackground(zip, slideIndex, { type: 'solid', color: options.color, alphaPct: options.alphaPct })
      }
      return vm.newNumber(slideIndex)
    })

    reg('addTextBox', async (handleHandle: any, slideIndexHandle: any, optionsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const dumped = dumpJsonish(vm, optionsHandle)
      const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as {
        text?: string
        x?: number
        y?: number
        w?: number
        h?: number
        fontPt?: number
        fontFace?: string
        color?: string
        bold?: boolean
        italic?: boolean
        align?: 'left' | 'center' | 'right'
        valign?: 'top' | 'middle' | 'bottom'
        fill?: string
        fillAlphaPct?: number
        lineColor?: string
        shadow?: boolean
        name?: string
      }
      if (typeof options.text !== 'string') throw new Error('addTextBox: options.text is required')
      for (const key of ['x', 'y', 'w', 'h'] as const) {
        if (typeof options[key] !== 'number') throw new Error(`addTextBox: options.${key} must be a number`)
      }
      const { entry } = await getSlideEntry(zip, slideIndex)
      const slideXml = await zip.file(entry.path)!.async('text')
      const shapeId = getNextSlideShapeId(slideXml)
      await appendSlideFragment(
        zip,
        slideIndex,
        buildFreeTextShapeXml(shapeId, {
          name: options.name,
          rect: { x: options.x!, y: options.y!, w: options.w!, h: options.h! },
          text: options.text,
          fontPt: options.fontPt,
          fontFace: options.fontFace,
          color: options.color,
          bold: options.bold,
          italic: options.italic,
          align: options.align,
          valign: options.valign,
          fill: options.fill,
          fillAlphaPct: options.fillAlphaPct,
          lineColor: options.lineColor,
          shadow: options.shadow,
        })
      )
      return vm.newNumber(shapeId)
    })

    reg('addShape', async (handleHandle: any, slideIndexHandle: any, optionsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const dumped = dumpJsonish(vm, optionsHandle)
      const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as {
        kind?: 'rect' | 'roundRect' | 'ellipse' | 'line'
        x?: number
        y?: number
        w?: number
        h?: number
        fill?: string
        fillAlphaPct?: number
        lineColor?: string
        lineWidthPt?: number
        lineDash?: 'solid' | 'dash'
        shadow?: boolean
        name?: string
      }
      const kind = options.kind ?? 'rect'
      if (!['rect', 'roundRect', 'ellipse', 'line'].includes(kind)) {
        throw new Error(`addShape: unsupported kind "${kind}"`)
      }
      for (const key of ['x', 'y', 'w', 'h'] as const) {
        if (typeof options[key] !== 'number') throw new Error(`addShape: options.${key} must be a number`)
      }
      const { entry } = await getSlideEntry(zip, slideIndex)
      const slideXml = await zip.file(entry.path)!.async('text')
      const shapeId = getNextSlideShapeId(slideXml)
      await appendSlideFragment(
        zip,
        slideIndex,
        buildPresetShapeXml(shapeId, {
          rect: { x: options.x!, y: options.y!, w: options.w!, h: options.h! },
          kind,
          name: options.name,
          fill: options.fill,
          fillAlphaPct: options.fillAlphaPct,
          lineColor: options.lineColor,
          lineWidthPt: options.lineWidthPt,
          lineDash: options.lineDash,
          shadow: options.shadow,
        })
      )
      return vm.newNumber(shapeId)
    })

    reg('addTable', async (handleHandle: any, slideIndexHandle: any, optionsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const dumped = dumpJsonish(vm, optionsHandle)
      const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as {
        x?: number
        y?: number
        w?: number
        h?: number
        rows?: unknown
        columnWidths?: number[]
        headerFill?: string
        headerTextColor?: string
        bodyFill?: string
        bandedFill?: string
        fontPt?: number
      }
      for (const key of ['x', 'y', 'w', 'h'] as const) {
        if (typeof options[key] !== 'number') throw new Error(`addTable: options.${key} must be a number`)
      }
      if (!Array.isArray(options.rows) || options.rows.length === 0) {
        throw new Error('addTable: options.rows must be a non-empty array')
      }
      const rows = options.rows.map((row) => {
        if (!Array.isArray(row)) throw new Error('addTable: each row must be an array')
        return row.map((cell) => String(cell))
      })
      const { entry } = await getSlideEntry(zip, slideIndex)
      const slideXml = await zip.file(entry.path)!.async('text')
      const shapeId = getNextSlideShapeId(slideXml)
      await appendSlideFragment(
        zip,
        slideIndex,
        buildTableXml(shapeId, {
          rect: { x: options.x!, y: options.y!, w: options.w!, h: options.h! },
          rows,
          columnWidths: options.columnWidths,
          headerFill: options.headerFill,
          headerTextColor: options.headerTextColor,
          bodyFill: options.bodyFill,
          bandedFill: options.bandedFill,
          fontPt: options.fontPt,
        })
      )
      return vm.newNumber(shapeId)
    })

    reg(
      'setTitleTextImageSlide',
      async (handleHandle: any, slideIndexHandle: any, blobHandle: any, optionsHandle: any) => {
        const zip = getDoc(Number(vm.dump(handleHandle)))
        const slideIndex = Number(vm.dump(slideIndexHandle))
        const blob = getBlob(String(vm.dump(blobHandle)))
        const dumped = dumpJsonish(vm, optionsHandle)
        const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as {
          title?: string
          body?: string
          filename?: string
          imageSide?: 'left' | 'right'
        }
        if (typeof options.title !== 'string') {
          throw new Error('setTitleTextImageSlide: options.title is required')
        }
        if (typeof options.body !== 'string') {
          throw new Error('setTitleTextImageSlide: options.body is required')
        }
        if (typeof options.filename !== 'string') {
          throw new Error('setTitleTextImageSlide: options.filename is required')
        }
        const imageSide = options.imageSide === 'left' ? 'left' : 'right'
        const size = await getSlideSize(zip)
        const rects = standardSlideRects(size)
        const gutter = size.w * 0.03
        const imageColumnW = (rects.body.w - gutter) * 0.42
        const textColumnW = rects.body.w - gutter - imageColumnW
        const imageColumn: SlideRect = {
          x: imageSide === 'right' ? rects.body.x + textColumnW + gutter : rects.body.x,
          y: rects.body.y,
          w: imageColumnW,
          h: rects.body.h,
        }
        const bodyRect: SlideRect = {
          x: imageSide === 'right' ? rects.body.x : imageColumn.x + imageColumn.w + gutter,
          y: rects.body.y,
          w: textColumnW,
          h: rects.body.h,
        }
        const imageDims = getImageSize(blob)
        const imageRect = imageDims ? fitRectPreservingAspect(imageColumn, imageDims) : imageColumn
        await resetPresentationSlide(zip, slideIndex, {
          title: options.title,
          body: options.body,
          bodyRect,
        })
        const mediaPath = await addPresentationImage(zip, slideIndex, blob, {
          filename: options.filename,
          x: imageRect.x,
          y: imageRect.y,
          w: imageRect.w,
          h: imageRect.h,
        })
        return vm.newString(mediaPath)
      }
    )

    reg('setCoverSlide', async (handleHandle: any, slideIndexHandle: any, blobHandle: any, optionsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const blob = getBlob(String(vm.dump(blobHandle)))
      const dumped = dumpJsonish(vm, optionsHandle)
      const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as {
        title?: string
        subtitle?: string
        filename?: string
        panelFill?: string
      }
      if (typeof options.title !== 'string') throw new Error('setCoverSlide: options.title is required')
      if (typeof options.subtitle !== 'string') throw new Error('setCoverSlide: options.subtitle is required')
      if (typeof options.filename !== 'string') throw new Error('setCoverSlide: options.filename is required')
      const { entry } = await getSlideEntry(zip, slideIndex)
      const size = await getSlideSize(zip)
      const currentSlideRelsPath = slideRelsPath(entry.path)
      const slideRelsXml = await getRequiredPresentationPart(zip, currentSlideRelsPath)
      const slideLayout = getSlideLayoutRelationshipTarget(slideRelsXml)
      zip.file(entry.path, buildCoverSlideXml(size, { title: options.title, subtitle: options.subtitle, panelFill: options.panelFill }))
      zip.file(
        currentSlideRelsPath,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${slideLayout.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="${slideLayout.target}"/>
</Relationships>`
      )
      const mediaPath = await addPresentationImage(zip, slideIndex, blob, {
        filename: options.filename,
        x: 0,
        y: 0,
        w: size.w,
        h: size.h,
        name: options.filename,
      })
      await sendLastPictureToBack(zip, slideIndex)
      return vm.newString(mediaPath)
    })

    reg('placeImage', async (handleHandle: any, slideIndexHandle: any, blobHandle: any, optionsHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const slideIndex = Number(vm.dump(slideIndexHandle))
      const blob = getBlob(String(vm.dump(blobHandle)))
      const dumped = dumpJsonish(vm, optionsHandle)
      const options = (typeof dumped === 'string' ? JSON.parse(dumped) : dumped) as {
        filename?: string
        x?: number
        y?: number
        w?: number
        h?: number
        name?: string
      }
      if (!options.filename) throw new Error('placeImage: options.filename is required')
      if (typeof options.x !== 'number' || typeof options.y !== 'number') {
        throw new Error('placeImage: options.x/y must be numbers')
      }
      let { w, h } = options
      if (typeof w !== 'number' && typeof h !== 'number') {
        throw new Error('placeImage: at least one of options.w/h must be a number')
      }
      const imageDims = getImageSize(blob)
      const aspect = imageDims && imageDims.h > 0 ? imageDims.w / imageDims.h : 1
      if (typeof w !== 'number') w = (h as number) * aspect
      if (typeof h !== 'number') h = w / aspect
      const mediaPath = await addPresentationImage(zip, slideIndex, blob, {
        filename: options.filename,
        x: options.x,
        y: options.y,
        w,
        h,
        name: options.name,
      })
      return vm.newString(mediaPath)
    })

    reg('savePresentation', async (handleHandle: any) => {
      const handle = Number(vm.dump(handleHandle))
      const zip = getDoc(handle)
      await ensurePresentationDocument(zip)
      openDocs.delete(handle)
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      return vm.newString(putBlob(buf))
    })

    // ── extractText(blob, filename) → string ──────────────────────────────
    reg('extractText', async (blobHandle: any, filenameHandle: any) => {
      const buf = getBlob(String(vm.dump(blobHandle)))
      const filename = String(vm.dump(filenameHandle))
      const mimeType = (mimeLookup(filename) as string | false) || 'application/octet-stream'
      const extractor = findExtractor(mimeType)
      if (!extractor) throw new Error(`No text extractor for "${filename}" (${mimeType})`)
      return vm.newString(await extractor(buf))
    })

    // ── createXlsx(specJson) → blob ────────────────────────────────────────
    reg('createXlsx', async (specHandle: any) => {
      const spec = JSON.parse(String(vm.dump(specHandle)))
      if (!spec || !Array.isArray(spec.sheets) || spec.sheets.length === 0) {
        throw new Error('createXlsx: spec must be {"sheets":[{"rows":[[...]]}]}')
      }
      const wb = new ExcelJS.Workbook()
      spec.sheets.forEach((sheet: any, i: number) => {
        const ws = wb.addWorksheet(String(sheet.name ?? `Sheet${i + 1}`))
        for (const row of sheet.rows ?? []) {
          if (!Array.isArray(row)) throw new Error('createXlsx: each row must be an array')
          ws.addRow(row)
        }
        const widths: unknown[] = Array.isArray(sheet.columnWidths) ? sheet.columnWidths : []
        widths.forEach((w, c) => {
          if (typeof w === 'number' && w > 0) ws.getColumn(c + 1).width = w
        })
      })
      const buf = Buffer.from(await wb.xlsx.writeBuffer())
      return vm.newString(putBlob(buf))
    })

    // ── addOutput(blob, filename) → fileId ─────────────────────────────────
    reg('addOutput', async (blobHandle: any, filenameHandle: any) => {
      const content = getBlob(String(vm.dump(blobHandle)))
      const filename = String(vm.dump(filenameHandle))
      const mimeType = (mimeLookup(filename) as string | false) || 'application/octet-stream'

      const dbFile = await materializeFile({
        content,
        name: filename,
        mimeType,
        owner: resolveFileOwner(invokeParams),
      })

      outputEntries.push({
        type: 'file' as const,
        id: dbFile.id,
        mimetype: mimeType,
        name: filename,
        size: content.byteLength,
      })

      return vm.newString(dbFile.id)
    })

    // ── execute user code ──────────────────────────────────────────────────
    const result = await vm.evalCodeAsync(userCode, 'user-script.js')

    if (result.error) {
      const errVal = vm.dump(result.error)
      result.error.dispose()
      const msg =
        errVal && typeof errVal === 'object'
          ? (errVal as any).message ?? JSON.stringify(errVal)
          : String(errVal)
      throw new Error(msg)
    }
    result.value.dispose()
  } finally {
    vm.dispose()
  }
}

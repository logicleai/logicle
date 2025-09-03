// pdfExtractor.ts — improved heading inference (bold/ALL-CAPS/context), lists & HTML tables intact

import { PDFExtract, PDFExtractResult, PDFExtractText } from 'pdf.js-extract'
import { TextExtractor } from '.'

// ======= TUNABLES =======
const Y_TOL = 2.0
const WORD_GAP = 2.5
const MIN_SEG_GAP = 6

const PARA_GAP_MULT = 0.8

const HEADING_LEN_MAX = 90 // generic max length for heading candidates
const HEADING_BUCKET_ROUND = 0.5 // rounding bin for style score buckets
const HEADING_MIN_FACTOR = 1.05 // minimum style-score factor vs body to consider heading

// NEW: style-score bonuses
const BOLD_BONUS = 0.18 // +18% if line is mostly bold
const ALLCAPS_BONUS = 0.1 // +10% if line looks ALL CAPS

// NEW: contextual heading fallback (for lines like "Lists")
const CTX_HEAD_MAX_LEN = 36 // short label-like lines become headings by context
const CTX_HEAD_PUNCT_RX = /^[\p{L}\p{N}\s\-&]+$/u // avoid lines with heavy punctuation
const CTX_GAP_ABOVE_MULT = 0.9
const CTX_GAP_BELOW_MULT = 0.7

const WRAP_COL = 80

const INDENT_TOL = 8
const MAX_LIST_LINE_CHARS = 120
const MIN_LIST_BLOCK = 2
const TIGHT_LINE_MULT = 0.6
const COLON_TIGHT_MULT = 0.85
const LOOKAHEAD_FOR_INDENT = 5

const MIN_TABLE_ROWS = 3
const TABLE_TIGHT_MULT = 2.4 // looser vertical spacing for table rows

// ======= TYPES =======
type Token = { x: number; w: number; str: string; fontSize: number; fontName?: string }
type Line = {
  y: number
  h: number
  xLeft: number
  text: string
  fontAvg: number
  styleScore: number // NEW: fontAvg × bonuses
  isBoldish: boolean
  isAllCaps: boolean
  tokens: Token[]
  segments: { x: number; text: string }[]
}

type TableRun = { start: number; end: number } // [start,end)

// ======= HELPERS =======
const normalizeSpaces = (s: string) => s.replace(/\s+/g, ' ').trim()
const escapeMdEscapedDot = (marker: string) => `${marker.replace(/\.$/, '')}\\.`
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const wrap = (s: string, col = WRAP_COL) => {
  if (!s) return ''
  const words = s.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    if (!line.length) {
      line = w
      continue
    }
    if (line.length + 1 + w.length <= col) line += ' ' + w
    else {
      out.push(line)
      line = w
    }
  }
  if (line) out.push(line)
  return out.join('\n')
}

const median = (nums: number[]) => {
  if (!nums.length) return 0
  const a = [...nums].sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
const mode = (nums: number[]) => {
  if (!nums.length) return null
  const m = new Map<number, number>()
  for (const n of nums) m.set(n, (m.get(n) || 0) + 1)
  let best: number | null = null,
    count = -1
  for (const [k, v] of m)
    if (v > count) {
      count = v
      best = k
    }
  return best
}

// ======= TOKEN → SEGMENTS (gap-based) =======
function splitIntoSegments(tokens: Token[]): { x: number; text: string }[] {
  if (!tokens.length) return []
  const gaps: number[] = []
  for (let i = 1; i < tokens.length; i++) {
    const g = tokens[i].x - (tokens[i - 1].x + tokens[i - 1].w)
    if (g > 0) gaps.push(g)
  }
  if (!gaps.length) {
    const startX = tokens[0].x
    return [{ x: startX, text: normalizeSpaces(tokens.map((t) => t.str).join(' ')) }]
  }
  const sorted = [...gaps].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const med = sorted[Math.floor(sorted.length * 0.5)]
  const iqr = Math.max(1, q3 - q1)
  const TH = Math.max(MIN_SEG_GAP, med + 0.75 * iqr, WORD_GAP * 2)

  const segs: { x: number; text: string }[] = []
  let buf = tokens[0].str
  let segStartX = tokens[0].x
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1],
      cur = tokens[i]
    const gap = cur.x - (prev.x + prev.w)
    if (gap > TH) {
      segs.push({ x: segStartX, text: normalizeSpaces(buf) })
      buf = cur.str
      segStartX = cur.x
    } else {
      buf += gap > WORD_GAP && !/\s$/.test(buf) ? ' ' + cur.str : cur.str
    }
  }
  segs.push({ x: segStartX, text: normalizeSpaces(buf) })
  return segs
}

// ======= GROUP INTO LINES =======
function groupIntoLines(items: PDFExtractText[]): Line[] {
  const enriched = items.map((it) => ({
    ...it,
    fontSize: typeof it.height === 'number' && it.height > 0 ? it.height : 10,
  }))

  // reading order
  enriched.sort((a, b) => (Math.abs(a.y - b.y) <= Y_TOL ? a.x - b.x : a.y - b.y))

  const buckets: { y: number; items: typeof enriched }[] = []
  for (const it of enriched) {
    const last = buckets[buckets.length - 1]
    if (!last || Math.abs(last.y - it.y) > Y_TOL) buckets.push({ y: it.y, items: [it] })
    else last.items.push(it)
  }

  const lines: Line[] = []
  for (const bucket of buckets) {
    const sorted = bucket.items.sort((a, b) => a.x - b.x)

    let text = ''
    const tokens: Token[] = []
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i],
        prev = sorted[i - 1]
      const needsSpace =
        i > 0 &&
        cur.x - (prev.x + prev.width) > WORD_GAP &&
        !/\s$/.test(text) &&
        !/^\s/.test(cur.str)
      if (needsSpace) text += ' '
      text += cur.str
      tokens.push({
        x: cur.x,
        w: cur.width,
        str: cur.str,
        fontSize: cur.fontSize,
        // @ts-ignore: pdf.js-extract provides fontName
        fontName: (cur as any).fontName,
      })
    }

    const fontAvg = sorted.reduce((s, it) => s + it.fontSize, 0) / Math.max(1, sorted.length)
    const xLeft = Math.min(...sorted.map((i) => i.x))
    const segments = splitIntoSegments(tokens)

    // NEW: style features
    const boldCount = tokens.filter((t) =>
      String(t.fontName || '')
        .toLowerCase()
        .includes('bold')
    ).length
    const isBoldish = boldCount > 0 && boldCount >= Math.ceil(tokens.length * 0.5)
    const isAllCaps = /^[^a-z]*[A-Z][A-Z0-9\s\-\&]*$/.test(text) && /[A-Z]/.test(text) // has at least one A-Z, no a-z
    const styleScore =
      fontAvg * (1 + (isBoldish ? BOLD_BONUS : 0) + (isAllCaps ? ALLCAPS_BONUS : 0))

    lines.push({
      y: bucket.y,
      h: fontAvg,
      xLeft,
      text: text.trim(),
      fontAvg,
      styleScore,
      isBoldish,
      isAllCaps,
      tokens,
      segments,
    })
  }
  return lines
}

// ======= TABLE: lexical splits & detection =======
function splitCellsLex(text: string): string[] {
  // split by 2+ spaces first
  const bySpaces = text
    .split(/\s{2,}/)
    .map(normalizeSpaces)
    .filter(Boolean)
  if (bySpaces.length >= 2) return bySpaces
  // common “Header N”, “Row i, Col j”
  const headers = Array.from(text.matchAll(/(Header\s+\d+)/gi)).map((m) => normalizeSpaces(m[1]))
  if (headers.length >= 2) return headers
  const rowcol = Array.from(text.matchAll(/(Row\s+\d+\s*,\s*Col\s+\d+)/gi)).map((m) =>
    normalizeSpaces(m[1])
  )
  if (rowcol.length >= 2) return rowcol
  return [normalizeSpaces(text)]
}
function cellsFromLine(ln: Line): string[] {
  if (ln.segments.length >= 2) return ln.segments.map((s) => normalizeSpaces(s.text))
  return splitCellsLex(ln.text)
}
const tightWith = (a: Line, b: Line, mult = TIGHT_LINE_MULT) =>
  Math.abs(a.y - b.y) <= Math.max(a.h, b.h) * (1 + mult)

function tryFindTableRun(
  lines: Line[],
  startIdx: number,
  tightMult = TABLE_TIGHT_MULT
): TableRun | null {
  const first = lines[startIdx]
  if (!first || !first.text) return null
  const head = cellsFromLine(first)
  if (head.length < 2) return null
  const ncols = head.length
  const run: number[] = [startIdx]
  let i = startIdx + 1
  while (i < lines.length) {
    const cur = lines[i]
    if (!cur.text) break
    const cells = cellsFromLine(cur)
    if (cells.length === ncols && tightWith(lines[i - 1], cur, tightMult)) {
      run.push(i)
      i++
    } else break
  }
  if (run.length < MIN_TABLE_ROWS) return null
  return { start: run[0], end: run[run.length - 1] + 1 }
}

function tableRunToHTML(lines: Line[], run: TableRun, caption?: string): string {
  const rows: string[][] = []
  for (let i = run.start; i < run.end; i++) rows.push(cellsFromLine(lines[i]))
  const ncols = Math.max(...rows.map((r) => r.length))
  for (const r of rows) {
    while (r.length < ncols) r.push('')
    if (r.length > ncols) r.length = ncols
  }
  const header = rows[0]
  const body = rows.slice(1)

  const parts: string[] = []
  parts.push('<table>')
  if (caption && caption.trim()) parts.push(`<caption>${escapeHtml(caption)}</caption>`)
  parts.push('<tr>' + header.map((h) => `<th>${escapeHtml(h)}</th>`).join('') + '</tr>')
  for (const r of body)
    parts.push('<tr>' + r.map((c) => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>')
  parts.push('</table>')
  return parts.join('\n')
}

// ======= LIST LEADS =======
const RX_PAREN = /^\s*\((\d+|[A-Za-z]+|[ivxlcdmIVXLCDM]+)[.)]?\)\s+/u
const RX_PLAIN = /^\s*(\d+|[A-Za-z]+|[ivxlcdmIVXLCDM]+)\.(?!\d)\s+/u
const RX_PLAIN_PAREN = /^\s*(\d+|[A-Za-z]+|[ivxlcdmIVXLCDM]+)\)\s+/u
const RX_BULLET = /^\s*([•◦▪‣·*–—-])\s+/u

type ListLead =
  | { kind: 'ol'; marker: string; clean: string }
  | { kind: 'ul'; marker: string; clean: string }
  | null

function parseListLead(s: string): ListLead {
  const t = s
  let m = t.match(RX_PAREN)
  if (m) return { kind: 'ol', marker: m[1], clean: t.slice(m[0].length) }
  m = t.match(RX_PLAIN)
  if (m) return { kind: 'ol', marker: m[1], clean: t.slice(m[0].length) }
  m = t.match(RX_PLAIN_PAREN)
  if (m) return { kind: 'ol', marker: m[1], clean: t.slice(m[0].length) }
  m = t.match(RX_BULLET)
  if (m) return { kind: 'ul', marker: m[1], clean: t.slice(m[0].length) }
  return null
}

// ======= HEADING BUCKETS (style-based) =======
function computeBodyFont(lines: Line[]) {
  // body font ~ most frequent rounded fontAvg among medium-length lines
  const bodyCandidates = lines
    .filter((l) => l.text && l.text.length >= 20) // avoid tiny labels
    .map((l) => Math.round(l.fontAvg / 0.5) * 0.5)
  return mode(bodyCandidates) ?? (median(lines.map((l) => l.fontAvg)) || 12)
}

function computeStyleBuckets(lines: Line[], bodyFont: number) {
  const candScores = lines
    .filter((l) => l.text && l.text.length <= HEADING_LEN_MAX)
    .map((l) => l.styleScore)

  // Bucket by rounded style score; pick up to 3 highest
  const unique = Array.from(
    new Set(candScores.map((s) => Math.round(s / HEADING_BUCKET_ROUND) * HEADING_BUCKET_ROUND))
  ).sort((a, b) => b - a)

  // Only keep buckets that are at least HEADING_MIN_FACTOR × bodyFont
  const keep = unique.filter((s) => s >= bodyFont * HEADING_MIN_FACTOR)
  const bucketToLevel = new Map<number, number>()
  for (let i = 0; i < keep.length && i < 3; i++) bucketToLevel.set(keep[i], i + 1)
  return bucketToLevel
}

function headingLevelFor(
  line: Line,
  bucketToLevel: Map<number, number>,
  bodyFont: number
): number | null {
  if (!line.text || line.text.length > HEADING_LEN_MAX) return null
  const key = Math.round(line.styleScore / HEADING_BUCKET_ROUND) * HEADING_BUCKET_ROUND
  const lvl = bucketToLevel.get(key) ?? null
  if (lvl) return lvl
  // if styleScore isn’t bucketed but is clearly above body, make it H3
  if (line.styleScore >= bodyFont * (HEADING_MIN_FACTOR + 0.05)) return 3
  return null
}

// NEW: contextual heading fallback for short isolated labels (e.g., "Lists")
function contextHeadingLevel(idx: number, lines: Line[]): number | null {
  const cur = lines[idx]
  if (!cur.text) return null
  const txt = cur.text.trim()
  if (txt.length === 0 || txt.length > CTX_HEAD_MAX_LEN) return null
  if (!CTX_HEAD_PUNCT_RX.test(txt)) return null
  if (/[：:]\s*$/.test(txt)) return null // colon lines begin list blocks, not headings

  const prev = lines[idx - 1],
    next = lines[idx + 1]
  const aboveGap = prev ? Math.abs(prev.y - cur.y) : Infinity
  const belowGap = next ? Math.abs(cur.y - next.y) : Infinity

  const aboveThr = prev ? Math.max(prev.h, cur.h) * (1 + CTX_GAP_ABOVE_MULT) : 0
  const belowThr = next ? Math.max(cur.h, next.h) * (1 + CTX_GAP_BELOW_MULT) : 0

  const isolated = aboveGap > aboveThr && belowGap > belowThr
  return isolated ? 3 : null
}

// ======= LINES → BLOCKS =======
function linesToBlocks(lines: Line[]): string[] {
  if (!lines.length) return []

  const bodyFont = computeBodyFont(lines)
  const bucketToLevel = computeStyleBuckets(lines, bodyFont)

  const blocks: string[] = []
  let paraBuf: string[] = []
  let emittedH1 = false

  const flushPara = () => {
    if (!paraBuf.length) return
    const text = normalizeSpaces(paraBuf.join(' '))
    blocks.push(wrap(text, WRAP_COL))
    paraBuf = []
  }

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]
    if (!cur.text) {
      flushPara()
      continue
    }

    // SPECIAL: plain "Table" acts as caption for the following table
    if (cur.text.trim().toLowerCase() === 'table') {
      const run = tryFindTableRun(lines, i + 1, TABLE_TIGHT_MULT)
      if (run) {
        flushPara()
        blocks.push(tableRunToHTML(lines, run, cur.text))
        i = run.end - 1
        continue
      }
      // fall through if no table
    }

    // HEADINGS — style buckets first
    let lvl = headingLevelFor(cur, bucketToLevel, bodyFont)
    // if not recognized by style, try contextual fallback
    if (!lvl) lvl = contextHeadingLevel(i, lines)

    if (lvl) {
      if (lvl === 1 && emittedH1) lvl = 2
      // captioned table lookahead after heading
      const run = tryFindTableRun(lines, i + 1, TABLE_TIGHT_MULT)
      if (run) {
        flushPara()
        blocks.push(tableRunToHTML(lines, run, cur.text))
        i = run.end - 1
        continue
      }
      flushPara()
      const prefix = lvl === 1 && !emittedH1 ? '# ' : lvl === 2 || emittedH1 ? '## ' : '### '
      blocks.push(prefix + normalizeSpaces(cur.text))
      if (lvl === 1) emittedH1 = true
      continue
    }

    // STANDALONE TABLE (no caption just above)
    const tableRun = tryFindTableRun(lines, i, TABLE_TIGHT_MULT)
    if (tableRun) {
      flushPara()
      blocks.push(tableRunToHTML(lines, tableRun))
      i = tableRun.end - 1
      continue
    }

    // LISTS — explicit
    const lead = parseListLead(cur.text)
    if (lead) {
      flushPara()
      let cleaned = normalizeSpaces(lead.clean)
      // merge hanging indent
      let j = i + 1
      while (
        j < lines.length &&
        !parseListLead(lines[j].text) &&
        tightWith(lines[j - 1], lines[j], TIGHT_LINE_MULT) &&
        lines[j].xLeft >= cur.xLeft + INDENT_TOL
      ) {
        cleaned += ' ' + normalizeSpaces(lines[j].text)
        j++
      }
      if (lead.kind === 'ol') blocks.push(`${escapeMdEscapedDot(lead.marker)} ${cleaned}`)
      else blocks.push(`· ${cleaned}`)
      i = j - 1
      continue
    }

    // LISTS — colon-triggered UL with guard
    if (/[：:]\s*$/.test(cur.text)) {
      const next = lines[i + 1]
      const nextLead = next ? parseListLead(next.text) : null
      if (nextLead) {
        flushPara()
        blocks.push(wrap(normalizeSpaces(cur.text), WRAP_COL))
        continue
      }
      let j = i + 1
      const ahead = lines
        .slice(j, Math.min(lines.length, j + LOOKAHEAD_FOR_INDENT))
        .filter((l) => l?.text)
      const baseIndent = ahead.length ? median(ahead.map((l) => l.xLeft)) : cur.xLeft
      const picked: number[] = []
      while (j < lines.length) {
        const ln = lines[j]
        const sameIndent = Math.abs(ln.xLeft - baseIndent) <= INDENT_TOL
        const short = ln.text.length <= MAX_LIST_LINE_CHARS
        const okSpacing =
          !picked.length || tightWith(lines[picked[picked.length - 1]], ln, COLON_TIGHT_MULT)
        const explicit = !!parseListLead(ln.text)
        if (sameIndent && short && okSpacing && !explicit) {
          picked.push(j)
          j++
          continue
        }
        break
      }
      flushPara()
      blocks.push(wrap(normalizeSpaces(cur.text), WRAP_COL))
      if (picked.length >= MIN_LIST_BLOCK) {
        for (const idx of picked) blocks.push(`· ${normalizeSpaces(lines[idx].text)}`)
        i = picked[picked.length - 1]
      }
      continue
    }

    // PARAGRAPHS
    const prev = lines[i - 1]
    const paraBreak = prev
      ? Math.abs(prev.y - cur.y) > Math.max(prev.h, cur.h) * (1 + PARA_GAP_MULT)
      : false
    if (paraBreak) flushPara()
    paraBuf.push(normalizeSpaces(cur.text))
  }

  flushPara()
  return blocks
}

// ======= PAGES → STRING =======
function pagesToOutput(res: PDFExtractResult): string {
  const parts: string[] = []
  for (const page of res.pages) {
    const lines = groupIntoLines(page.content)
    const blocks = linesToBlocks(lines)
    parts.push(blocks.join('\n\n'))
  }
  return parts.join('\n\n---\n\n')
}

// ======= PUBLIC API =======
export const pdfExtractor: TextExtractor = async (data: Buffer) => {
  const pdfExtract = new PDFExtract()
  const options = { normalizeWhitespace: true }
  const output = await pdfExtract.extractBuffer(data, options)
  return pagesToOutput(output)
}

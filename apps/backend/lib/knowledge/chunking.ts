/**
 * Structure-aware chunking of extracted document text.
 *
 * Chunks are the unit of both retrieval (BM25 scoring) and of the `read` tool function, so they
 * need to be small enough to be cheap to return, but large enough to stand on their own when the
 * model reads one in isolation. We split on blank lines (paragraphs), never in the middle of a
 * paragraph unless the paragraph alone exceeds `maxChars`, and we carry the tail of the previous
 * chunk into the next one so a fact straddling a boundary is still findable from either side.
 *
 * Markdown headings are tracked separately and attached to every chunk below them: the extractors
 * in `lib/textextraction` emit markdown, so this gives each chunk a cheap "where am I in the
 * document" label that costs a handful of tokens and makes search results readable.
 */

export interface TextChunk {
  seq: number
  heading: string | null
  text: string
}

export interface ChunkingOptions {
  targetChars: number
  overlapChars: number
  maxChars: number
}

export const defaultChunkingOptions: ChunkingOptions = {
  targetChars: 1200,
  overlapChars: 150,
  maxChars: 2400,
}

const headingRegex = /^(#{1,6})\s+(.*\S)\s*$/

/** Renders the active heading stack as `Parent > Child`, dropping empty levels. */
const renderHeadingPath = (stack: (string | undefined)[]): string | null => {
  const path = stack.filter((entry): entry is string => Boolean(entry))
  return path.length === 0 ? null : path.join(' > ')
}

/** Splits an oversized paragraph on sentence boundaries, falling back to a hard cut. */
const splitOversizedBlock = (block: string, maxChars: number): string[] => {
  const pieces: string[] = []
  let remaining = block
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars)
    // Prefer the last sentence end in the second half of the window, then the last space.
    const sentenceEnd = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('\n')
    )
    const spaceEnd = window.lastIndexOf(' ')
    const cut =
      sentenceEnd > maxChars / 2 ? sentenceEnd + 1 : spaceEnd > maxChars / 2 ? spaceEnd : maxChars
    pieces.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  if (remaining.length > 0) pieces.push(remaining)
  return pieces.filter((piece) => piece.length > 0)
}

/** Last `overlapChars` characters of a chunk, snapped to a word boundary. */
const overlapTail = (text: string, overlapChars: number): string => {
  if (overlapChars <= 0 || text.length <= overlapChars) return ''
  const tail = text.slice(text.length - overlapChars)
  const spaceIndex = tail.indexOf(' ')
  return spaceIndex === -1 ? tail : tail.slice(spaceIndex + 1)
}

export const chunkText = (
  text: string,
  options: ChunkingOptions = defaultChunkingOptions
): TextChunk[] => {
  const { targetChars, overlapChars, maxChars } = options
  const normalized = text.replace(/\r\n/g, '\n')
  const chunks: TextChunk[] = []

  const headingStack: (string | undefined)[] = []
  let pending: string[] = []
  let pendingLength = 0
  let pendingHeading: string | null = null
  // True while `pending` holds nothing but the overlap tail carried over from the previous
  // chunk. Flushing in that state would emit a chunk that is pure duplicate.
  let pendingIsOnlyOverlap = true

  const flush = () => {
    if (pending.length === 0 || pendingIsOnlyOverlap) return
    const body = pending.join('\n\n').trim()
    if (body.length > 0) {
      chunks.push({ seq: chunks.length, heading: pendingHeading, text: body })
    }
    const tail = overlapTail(body, overlapChars)
    pending = tail ? [tail] : []
    pendingLength = tail.length
    pendingHeading = renderHeadingPath(headingStack)
    pendingIsOnlyOverlap = true
  }

  const resetPending = () => {
    pending = []
    pendingLength = 0
    pendingHeading = renderHeadingPath(headingStack)
    pendingIsOnlyOverlap = true
  }

  for (const rawBlock of normalized.split(/\n\s*\n+/)) {
    const block = rawBlock.trim()
    if (block.length === 0) continue

    const headingMatch = block.match(headingRegex)
    if (headingMatch) {
      // A heading closes the current chunk: it starts a new section, and mixing content from
      // two sections in one chunk would make the `heading` label a lie.
      flush()
      const level = headingMatch[1]!.length
      headingStack.length = level - 1
      headingStack[level - 1] = headingMatch[2]!
      resetPending()
      continue
    }

    if (block.length > maxChars) {
      flush()
      resetPending()
      for (const piece of splitOversizedBlock(block, maxChars)) {
        chunks.push({ seq: chunks.length, heading: renderHeadingPath(headingStack), text: piece })
      }
      continue
    }

    if (pending.length === 0) {
      pendingHeading = renderHeadingPath(headingStack)
    }
    pending.push(block)
    pendingLength += block.length + 2
    pendingIsOnlyOverlap = false
    if (pendingLength >= targetChars) flush()
  }

  flush()
  return chunks
}

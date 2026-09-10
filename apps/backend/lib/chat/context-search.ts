const MAX_TARGET_EXCERPTS = 4
const MAX_EXCERPT_CHARS = 800
const SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'give',
  'in',
  'include',
  'is',
  'it',
  'me',
  'of',
  'on',
  'only',
  'reply',
  'the',
  'to',
  'was',
  'what',
  'with',
])

const searchTokens = (value: string): string[] =>
  [...value.toLowerCase().matchAll(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu)]
    .map(([token]) => token)
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))

const splitSearchChunks = (text: string): string[] =>
  text.split(/\n\s*\n+/).flatMap((paragraph) => {
    const trimmed = paragraph.trim()
    if (trimmed.length <= MAX_EXCERPT_CHARS) return trimmed ? [trimmed] : []
    const chunks: string[] = []
    for (let start = 0; start < trimmed.length; start += MAX_EXCERPT_CHARS) {
      chunks.push(trimmed.slice(start, start + MAX_EXCERPT_CHARS))
    }
    return chunks
  })

interface RankedExcerpt {
  excerpt: string
  index: number
  score: number
}

const rankRelevantExcerpts = (text: string, query: string): RankedExcerpt[] => {
  const queryTokens = [...new Set(searchTokens(query))]
  if (queryTokens.length === 0) return []
  const normalizedQuery = query.trim().toLowerCase()
  return splitSearchChunks(text)
    .map((excerpt, index) => {
      const lower = excerpt.toLowerCase()
      const chunkTokens = new Set(searchTokens(excerpt))
      const matched = queryTokens.filter((token) => chunkTokens.has(token)).length
      const phraseBonus = normalizedQuery.length > 2 && lower.includes(normalizedQuery) ? 2 : 0
      return { excerpt, index, score: matched + phraseBonus }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
}

/** Deterministic lexical excerpts used to keep retrieval cheaper than replaying a full payload. */
export const findRelevantExcerpts = (text: string, query: string): string[] => {
  const ranked = rankRelevantExcerpts(text, query)
  const bestScore = ranked[0]?.score
  return ranked
    .filter(({ score }) => score === bestScore)
    .slice(0, MAX_TARGET_EXCERPTS)
    .map(({ excerpt }) => excerpt)
}

/** Ranks the best excerpt from each message, preferring stronger matches then newer messages. */
export const findRelevantMessageExcerpts = (
  messages: Array<{ id: string; role: string; text: string }>,
  query: string,
  limit: number
): Array<{ id: string; role: string; excerpt: string }> =>
  messages
    .flatMap((message, messageIndex) => {
      const best = rankRelevantExcerpts(message.text, query)[0]
      return best ? [{ ...message, messageIndex, excerpt: best.excerpt, score: best.score }] : []
    })
    .sort((a, b) => b.score - a.score || b.messageIndex - a.messageIndex)
    .slice(0, limit)
    .map(({ id, role, excerpt }) => ({ id, role, excerpt }))

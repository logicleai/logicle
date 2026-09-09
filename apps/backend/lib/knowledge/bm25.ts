/**
 * A small in-memory BM25 index.
 *
 * A knowledge box is bounded by construction — a handful of documents attached to one tool — so
 * the whole chunk set fits in memory comfortably and there is no reason to push ranking into the
 * database, where SQLite FTS5 and PostgreSQL `tsvector` would need two divergent implementations
 * and two migration paths. Keeping ranking here also keeps it pure and unit-testable, and leaves
 * the door open for a vector index alongside it later: both produce `{ ref, score }` and can be
 * fused without touching call sites.
 */

export interface Bm25Document {
  ref: string
  text: string
}

export interface Bm25Hit {
  ref: string
  score: number
}

export interface Bm25Options {
  k1: number
  b: number
}

export const defaultBm25Options: Bm25Options = { k1: 1.2, b: 0.75 }

/**
 * Lowercases and splits on anything that is not a letter or a digit, keeping the tokenizer
 * language-agnostic (`\p{L}` covers accented and non-latin scripts). Single-character tokens are
 * dropped: they are almost always noise and they blow up the postings lists.
 */
export const tokenize = (text: string): string[] => {
  const tokens: string[] = []
  for (const match of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const token = match[0]
    if (token.length > 1) tokens.push(token)
  }
  return tokens
}

export class Bm25Index {
  private readonly refs: string[] = []
  private readonly lengths: number[] = []
  /** token -> (document ordinal -> term frequency) */
  private readonly postings = new Map<string, Map<number, number>>()
  private averageLength = 0

  constructor(
    documents: Bm25Document[],
    private readonly options: Bm25Options = defaultBm25Options
  ) {
    let totalLength = 0
    for (const document of documents) {
      const ordinal = this.refs.length
      const tokens = tokenize(document.text)
      this.refs.push(document.ref)
      this.lengths.push(tokens.length)
      totalLength += tokens.length
      for (const token of tokens) {
        let posting = this.postings.get(token)
        if (!posting) {
          posting = new Map()
          this.postings.set(token, posting)
        }
        posting.set(ordinal, (posting.get(ordinal) ?? 0) + 1)
      }
    }
    this.averageLength = this.refs.length === 0 ? 0 : totalLength / this.refs.length
  }

  get size(): number {
    return this.refs.length
  }

  search(query: string, limit: number): Bm25Hit[] {
    if (this.refs.length === 0) return []
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const { k1, b } = this.options
    const scores = new Map<number, number>()

    // Deduplicate query terms: repeating a word in the query should not multiply its weight.
    for (const token of new Set(queryTokens)) {
      const posting = this.postings.get(token)
      if (!posting) continue
      // Robertson/Sparck-Jones idf with the +1 shift that keeps it non-negative for terms
      // present in more than half of the documents.
      const idf = Math.log(1 + (this.refs.length - posting.size + 0.5) / (posting.size + 0.5))
      for (const [ordinal, frequency] of posting) {
        const normalization =
          k1 * (1 - b + (b * this.lengths[ordinal]!) / (this.averageLength || 1))
        const contribution = (idf * (frequency * (k1 + 1))) / (frequency + normalization)
        scores.set(ordinal, (scores.get(ordinal) ?? 0) + contribution)
      }
    }

    return [...scores.entries()]
      .sort((left, right) => right[1] - left[1] || left[0] - right[0])
      .slice(0, limit)
      .map(([ordinal, score]) => ({ ref: this.refs[ordinal]!, score }))
  }
}

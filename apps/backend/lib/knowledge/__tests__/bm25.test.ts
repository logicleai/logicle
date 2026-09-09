import { describe, expect, it } from 'vitest'
import { Bm25Index, tokenize } from '@/backend/lib/knowledge/bm25'

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric characters', () => {
    expect(tokenize('Hello, World! 42')).toEqual(['hello', 'world', '42'])
  })

  it('keeps accented and non-latin words', () => {
    expect(tokenize('perché città')).toEqual(['perché', 'città'])
    expect(tokenize('Ελληνικά')).toEqual(['ελληνικά'])
  })

  it('drops single-character tokens', () => {
    expect(tokenize('a b cd')).toEqual(['cd'])
  })
})

const documents = [
  { ref: 'invoice', text: 'The invoice is due net 30 days after delivery of the goods.' },
  { ref: 'privacy', text: 'Personal data is retained for 24 months and then deleted.' },
  { ref: 'sla', text: 'Support responds within 4 hours. Uptime target is 99.9 percent.' },
]

describe('Bm25Index', () => {
  it('reports its size', () => {
    expect(new Bm25Index(documents).size).toBe(3)
    expect(new Bm25Index([]).size).toBe(0)
  })

  it('returns nothing for an empty index or an empty query', () => {
    expect(new Bm25Index([]).search('invoice', 5)).toEqual([])
    expect(new Bm25Index(documents).search('   ', 5)).toEqual([])
  })

  it('ranks the document containing the query term first', () => {
    const hits = new Bm25Index(documents).search('invoice due', 3)
    expect(hits[0]!.ref).toBe('invoice')
  })

  it('ignores terms that appear in no document', () => {
    const hits = new Bm25Index(documents).search('zzzznotaword', 3)
    expect(hits).toEqual([])
  })

  it('respects the result limit', () => {
    const hits = new Bm25Index(documents).search('the is', 1)
    expect(hits).toHaveLength(1)
  })

  it('does not double-weight a repeated query term', () => {
    const index = new Bm25Index(documents)
    const once = index.search('invoice', 3)
    const twice = index.search('invoice invoice invoice', 3)
    expect(twice).toEqual(once)
  })

  it('favours the shorter document when term frequency is equal', () => {
    const index = new Bm25Index([
      { ref: 'short', text: 'refund policy' },
      { ref: 'long', text: `refund policy ${'filler word '.repeat(50)}` },
    ])
    expect(index.search('refund', 2)[0]!.ref).toBe('short')
  })

  it('produces scores in descending order', () => {
    const hits = new Bm25Index(documents).search('data delivery hours', 3)
    const scores = hits.map((hit) => hit.score)
    expect([...scores].sort((left, right) => right - left)).toEqual(scores)
  })
})

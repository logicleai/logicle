import { describe, expect, it } from 'vitest'
import { chunkText, defaultChunkingOptions } from '@/backend/lib/knowledge/chunking'

const options = { targetChars: 100, overlapChars: 20, maxChars: 200 }

describe('chunkText', () => {
  it('returns nothing for empty input', () => {
    expect(chunkText('', options)).toEqual([])
    expect(chunkText('   \n\n  \n', options)).toEqual([])
  })

  it('keeps a short document in a single chunk', () => {
    const chunks = chunkText('Hello world.\n\nSecond paragraph.', options)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.text).toBe('Hello world.\n\nSecond paragraph.')
    expect(chunks[0]!.seq).toBe(0)
    expect(chunks[0]!.heading).toBeNull()
  })

  it('numbers chunks contiguously from zero', () => {
    const paragraph = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.'
    const chunks = chunkText(Array(10).fill(paragraph).join('\n\n'), options)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((chunk) => chunk.seq)).toEqual(chunks.map((_, index) => index))
  })

  it('attaches the markdown heading path to chunks below it', () => {
    const text = ['# Contract', 'Intro text.', '## Payment terms', 'Net 30 days.'].join('\n\n')
    const chunks = chunkText(text, options)
    expect(chunks.map((chunk) => chunk.heading)).toEqual(['Contract', 'Contract > Payment terms'])
    expect(chunks[1]!.text).toBe('Net 30 days.')
  })

  it('pops the heading stack when going back up a level', () => {
    const text = ['# A', 'one', '## A1', 'two', '# B', 'three'].join('\n\n')
    expect(chunkText(text, options).map((chunk) => chunk.heading)).toEqual(['A', 'A > A1', 'B'])
  })

  it('never merges content from two sections into one chunk', () => {
    const text = ['# A', 'short', '# B', 'short'].join('\n\n')
    const chunks = chunkText(text, options)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.text).toBe('short')
    expect(chunks[1]!.text).toBe('short')
  })

  it('carries an overlap tail into the following chunk', () => {
    const first = 'a'.repeat(60)
    const second = 'b'.repeat(60)
    const third = 'c'.repeat(60)
    const chunks = chunkText([first, second, third].join('\n\n'), options)
    expect(chunks.length).toBeGreaterThan(1)
    // The tail of chunk 0 reappears at the start of chunk 1.
    const tail = chunks[0]!.text.slice(-options.overlapChars)
    expect(chunks[1]!.text.startsWith(tail)).toBe(true)
  })

  it('does not emit a chunk made only of the carried-over overlap', () => {
    const chunks = chunkText('x'.repeat(150), options)
    const texts = chunks.map((chunk) => chunk.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('splits a paragraph longer than maxChars', () => {
    const sentences = Array(20).fill('This is a sentence about invoices.').join(' ')
    const chunks = chunkText(sentences, options)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(options.maxChars)
    }
  })

  it('normalizes CRLF line endings', () => {
    const chunks = chunkText('first\r\n\r\nsecond', options)
    expect(chunks[0]!.text).toBe('first\n\nsecond')
  })

  it('exposes usable defaults', () => {
    expect(defaultChunkingOptions.targetChars).toBeGreaterThan(0)
    expect(defaultChunkingOptions.overlapChars).toBeLessThan(defaultChunkingOptions.targetChars)
    expect(defaultChunkingOptions.maxChars).toBeGreaterThan(defaultChunkingOptions.targetChars)
  })
})

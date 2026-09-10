import { describe, expect, it } from 'vitest'
import { generateCorpus, generateNeedleScenario } from '@/backend/lib/eval/scenarios/generator'

const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length

describe('generateCorpus', () => {
  it('produces the requested number of documents', () => {
    expect(generateCorpus({ documents: 12, wordsPerDocument: 200 }).documents).toHaveLength(12)
  })

  it('is deterministic for a given seed', () => {
    const spec = { documents: 6, wordsPerDocument: 300, seed: 42 }
    expect(generateCorpus(spec).documents).toEqual(generateCorpus(spec).documents)
  })

  it('produces a different corpus for a different seed', () => {
    const first = generateCorpus({ documents: 4, wordsPerDocument: 300, seed: 1 })
    const second = generateCorpus({ documents: 4, wordsPerDocument: 300, seed: 2 })
    expect(first.documents[0]!.text).not.toBe(second.documents[0]!.text)
  })

  it('reaches roughly the requested document size', () => {
    const corpus = generateCorpus({ documents: 3, wordsPerDocument: 600 })
    for (const document of corpus.documents) {
      expect(wordsIn(document.text)).toBeGreaterThanOrEqual(600)
      // Clauses are added whole, so overshoot is bounded by the longest clause.
      expect(wordsIn(document.text)).toBeLessThan(600 + 250)
    }
  })

  it('scales total size with both dials', () => {
    const small = generateCorpus({ documents: 5, wordsPerDocument: 200 }).approximateWords
    const moreDocuments = generateCorpus({ documents: 20, wordsPerDocument: 200 }).approximateWords
    const biggerDocuments = generateCorpus({ documents: 5, wordsPerDocument: 800 }).approximateWords
    expect(moreDocuments).toBeGreaterThan(small * 3)
    expect(biggerDocuments).toBeGreaterThan(small * 3)
  })

  it('states the needle value in exactly one document', () => {
    const corpus = generateCorpus({ documents: 10, wordsPerDocument: 200, distractors: 4 })
    const carrying = corpus.documents.filter((document) =>
      document.text.includes(corpus.needleValue)
    )
    expect(carrying).toHaveLength(1)
  })

  it('gives every distractor a different value from the needle', () => {
    const corpus = generateCorpus({ documents: 10, wordsPerDocument: 200, distractors: 5 })
    expect(corpus.distractorValues).toHaveLength(5)
    expect(new Set(corpus.distractorValues).size).toBe(5)
    expect(corpus.distractorValues).not.toContain(corpus.needleValue)
  })

  it('states the clause only in the needle and its distractors', () => {
    const corpus = generateCorpus({ documents: 12, wordsPerDocument: 200, distractors: 3 })
    const withClause = corpus.documents.filter((document) =>
      document.text.includes('accrue interest at')
    )
    expect(withClause).toHaveLength(4)
  })

  it('supports a corpus with no distractors at all', () => {
    const corpus = generateCorpus({ documents: 6, wordsPerDocument: 200, distractors: 0 })
    expect(corpus.distractorValues).toEqual([])
    const withClause = corpus.documents.filter((document) =>
      document.text.includes('accrue interest at')
    )
    expect(withClause).toHaveLength(1)
  })

  it('places the needle near the top at depth 0 and near the end at depth 1', () => {
    const shallow = generateCorpus({
      documents: 3,
      wordsPerDocument: 1500,
      needleDocument: 0,
      needleDepth: 0,
      distractors: 0,
    })
    const deep = generateCorpus({
      documents: 3,
      wordsPerDocument: 1500,
      needleDocument: 0,
      needleDepth: 1,
      distractors: 0,
    })
    const positionOf = (corpus: ReturnType<typeof generateCorpus>) => {
      const text = corpus.documents[0]!.text
      return text.indexOf('accrue interest at') / text.length
    }
    expect(positionOf(shallow)).toBeLessThan(0.3)
    expect(positionOf(deep)).toBeGreaterThan(0.7)
  })

  it('clamps a needle index outside the corpus', () => {
    const corpus = generateCorpus({ documents: 4, wordsPerDocument: 200, needleDocument: 99 })
    expect(corpus.documents.some((document) => document.text.includes(corpus.needleValue))).toBe(
      true
    )
  })

  it('gives every document a distinct name', () => {
    const corpus = generateCorpus({ documents: 40, wordsPerDocument: 150 })
    expect(new Set(corpus.documents.map((document) => document.name)).size).toBe(40)
  })
})

describe('generateNeedleScenario', () => {
  it('forbids every distractor value in the answer key', () => {
    const scenario = generateNeedleScenario({
      documents: 8,
      wordsPerDocument: 200,
      distractors: 3,
    })
    expect(scenario.answerKey!.mustMention).toHaveLength(1)
    expect(scenario.answerKey!.mustNotMention).toHaveLength(3)
    expect(scenario.answerKey!.mustNotMention).not.toContain(scenario.answerKey!.mustMention![0])
  })

  it('names the needle supplier in the goal without revealing the rate', () => {
    const scenario = generateNeedleScenario({ documents: 6, wordsPerDocument: 200 })
    const rate = scenario.answerKey!.mustMention![0]!
    expect(scenario.goal).not.toContain(rate)
    expect(scenario.rubric).toContain('agreement')
  })

  it('encodes the corpus size in the id, so a sweep reads as a curve', () => {
    expect(generateNeedleScenario({ documents: 25, wordsPerDocument: 700 }).id).toBe(
      'needle-25docs-700w'
    )
  })
})

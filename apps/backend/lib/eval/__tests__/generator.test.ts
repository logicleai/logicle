import { describe, expect, it } from 'vitest'
import {
  generateCorpus,
  generateFlipScenarioPair,
  generateNeedleScenario,
} from '@/backend/lib/eval/scenarios/generator'

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

describe('withholding the needle', () => {
  const spec = { documents: 9, wordsPerDocument: 250, distractors: 3, seed: 7 }

  it('removes the answer from the corpus but keeps the document', () => {
    const positive = generateCorpus(spec)
    const negative = generateCorpus({ ...spec, withholdNeedle: 'clause' })
    expect(negative.documents).toHaveLength(positive.documents.length)
    expect(negative.needleValue).toBe(positive.needleValue)
    expect(
      negative.documents.some((document) => document.text.includes(negative.needleValue))
    ).toBe(false)
  })

  it('makes the negative corpus the positive corpus with one contiguous clause deleted', () => {
    const positive = generateCorpus(spec)
    const negative = generateCorpus({ ...spec, withholdNeedle: 'clause' })
    const differing = positive.documents.filter(
      (document, index) => document.text !== negative.documents[index]!.text
    )
    expect(differing).toHaveLength(1)

    const positiveNeedle = differing[0]!
    const negativeNeedle = negative.documents.find(
      (document) => document.name === positiveNeedle.name
    )!
    const paymentStart = positiveNeedle.text.search(/## Payment terms/)
    const nextSection = positiveNeedle.text.indexOf('\n\n## ', paymentStart + 1)
    const clauseEnd = nextSection === -1 ? positiveNeedle.text.length : nextSection
    const withoutPayment =
      nextSection === -1
        ? positiveNeedle.text.slice(0, paymentStart - 2)
        : positiveNeedle.text.slice(0, paymentStart) + positiveNeedle.text.slice(clauseEnd + 2)

    expect(paymentStart).toBeGreaterThan(0)
    expect(positiveNeedle.text.slice(paymentStart, clauseEnd)).toContain(positive.needleValue)
    expect(negativeNeedle.text).toBe(withoutPayment)
    expect(negativeNeedle.text).not.toMatch(/## \d+\./)
  })

  it('keeps the distractors in place, so the corpus still looks like it should have the answer', () => {
    const negative = generateCorpus({ ...spec, withholdNeedle: 'clause' })
    const withClause = negative.documents.filter((document) =>
      document.text.includes('accrue interest at')
    )
    expect(withClause).toHaveLength(3)
    for (const value of negative.distractorValues) {
      expect(negative.documents.some((document) => document.text.includes(value))).toBe(true)
    }
  })

  it('drops the whole document in document mode without disturbing the others', () => {
    const positive = generateCorpus(spec)
    const negative = generateCorpus({ ...spec, withholdNeedle: 'document' })
    expect(negative.documents).toHaveLength(positive.documents.length - 1)
    expect(
      negative.documents.some((document) => document.name.includes(negative.needleReference))
    ).toBe(false)
    // The documents after the removed one must not have been re-rolled.
    const kept = positive.documents.filter(
      (document) => !document.name.includes(positive.needleReference)
    )
    expect(negative.documents.map((document) => document.text)).toEqual(
      kept.map((document) => document.text)
    )
  })
})

describe('generateFlipScenarioPair', () => {
  const spec = { documents: 8, wordsPerDocument: 250, distractors: 3, seed: 3 }

  it('gives the two halves the same goal and persona', () => {
    const [positive, negative] = generateFlipScenarioPair(spec)
    expect(negative.goal).toBe(positive.goal)
    expect(negative.persona).toBe(positive.persona)
    expect(negative.maxTurns).toBe(positive.maxTurns)
  })

  it('shares a pair id and labels each half', () => {
    const [positive, negative] = generateFlipScenarioPair(spec, { id: 'pair-x' })
    expect(positive.flip).toEqual({
      pairId: 'pair-x',
      corpus: 'positive',
      needleValue: positive.flip!.needleValue,
      distractorValues: positive.flip!.distractorValues,
    })
    expect(negative.flip!.pairId).toBe('pair-x')
    expect(negative.flip!.corpus).toBe('negative')
    expect(negative.flip!.needleValue).toBe(positive.flip!.needleValue)
    expect(positive.id).not.toBe(negative.id)
  })

  it('requires the answer on the positive half and forbids every value on the negative one', () => {
    const [positive, negative] = generateFlipScenarioPair(spec)
    expect(positive.answerKey!.mustMention).toEqual([positive.flip!.needleValue])
    expect(negative.answerKey!.mustMention).toBeUndefined()
    expect(negative.answerKey!.mustNotMention).toContain(positive.flip!.needleValue)
    for (const value of positive.flip!.distractorValues) {
      expect(negative.answerKey!.mustNotMention).toContain(value)
    }
  })

  it('never reveals in the goal that the answer is missing', () => {
    const [, negative] = generateFlipScenarioPair(spec)
    expect(negative.goal).not.toMatch(/not in|missing|absent|withheld/i)
    expect(negative.goal).not.toContain(negative.flip!.needleValue)
  })

  it('tells the judge, but only the judge, that there is nothing to find', () => {
    const [, negative] = generateFlipScenarioPair(spec)
    expect(negative.rubric).toMatch(/do not state|not in the documents/i)
  })
})

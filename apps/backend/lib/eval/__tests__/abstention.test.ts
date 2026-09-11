import { describe, expect, it } from 'vitest'
import {
  classifyAssertion,
  flipVerdict,
  pairFlipRuns,
  summarizeFlip,
} from '@/backend/lib/eval/abstention'
import type { AssertionClass, RunResult, TranscriptEntry } from '@/backend/lib/eval/types'

const FLIP = { needleValue: '1.80%', distractorValues: ['1.45%', '2.15%'] }

const assistant = (text: string): TranscriptEntry[] => [
  { role: 'user', text: 'what is the late payment rate?' },
  { role: 'assistant', text },
]

describe('classifyAssertion', () => {
  it('recognizes the needle value', () => {
    expect(classifyAssertion(assistant('The rate is 1.80% per month.'), 'goal-reached', FLIP)).toBe(
      'asserted-needle'
    )
  })

  it('canonicalizes equivalent percentage formatting', () => {
    expect(
      classifyAssertion(assistant('The rate is 1.8 percent per month.'), 'goal-reached', FLIP)
    ).toBe('asserted-needle')
  })

  it('recognizes another contract value as a wrong assertion', () => {
    expect(classifyAssertion(assistant('The rate is 2.15%.'), 'goal-reached', FLIP)).toBe(
      'asserted-other'
    )
  })

  it('treats a finished conversation with no value stated as abstention', () => {
    expect(
      classifyAssertion(
        assistant('I could not find a late payment rate in these documents.'),
        'goal-reached',
        FLIP
      )
    ).toBe('abstained')
  })

  it('distinguishes running out of turns from declining', () => {
    expect(classifyAssertion(assistant('Let me search again.'), 'max-turns', FLIP)).toBe(
      'exhausted'
    )
  })

  it('does not count the simulated user giving up as abstention', () => {
    expect(classifyAssertion(assistant('Let me keep looking.'), 'gave-up', FLIP)).toBe('exhausted')
  })

  it('detects an invented percentage that was not one of the generated distractors', () => {
    expect(classifyAssertion(assistant('The rate is 9.99%.'), 'goal-reached', FLIP)).toBe(
      'asserted-other'
    )
  })

  it('ignores values the user said but the assistant never did', () => {
    const transcript: TranscriptEntry[] = [
      { role: 'user', text: 'is it 1.80%?' },
      { role: 'assistant', text: 'I cannot confirm that from the documents.' },
    ]
    expect(classifyAssertion(transcript, 'goal-reached', FLIP)).toBe('abstained')
  })

  it('reports an errored run as an error rather than an abstention', () => {
    expect(classifyAssertion([], 'error', FLIP)).toBe('error')
  })

  it('does not treat a mixed answer as clean needle coverage', () => {
    expect(
      classifyAssertion(
        assistant('Theirs is 1.80%; the 2.15% figure belongs to another supplier.'),
        'goal-reached',
        FLIP
      )
    ).toBe('asserted-other')
  })
})

describe('flipVerdict', () => {
  const cases: [AssertionClass, AssertionClass, string][] = [
    ['asserted-needle', 'abstained', 'coverage'],
    ['asserted-needle', 'asserted-needle', 'hallucination-under-absence'],
    ['asserted-needle', 'asserted-other', 'hallucination-under-absence'],
    ['asserted-needle', 'exhausted', 'over-searching'],
    ['abstained', 'abstained', 'over-closure'],
    ['asserted-other', 'abstained', 'positive-failure'],
    ['exhausted', 'abstained', 'positive-failure'],
    ['error', 'abstained', 'positive-failure'],
  ]

  for (const [positive, negative, expected] of cases) {
    it(`${positive} / ${negative} → ${expected}`, () => {
      expect(flipVerdict(positive, negative)).toBe(expected)
    })
  }

  it('does not credit coverage to an arm that answered correctly on neither corpus', () => {
    expect(flipVerdict('abstained', 'abstained')).not.toBe('coverage')
  })
})

const makeRun = (
  armName: string,
  repetition: number,
  corpus: 'positive' | 'negative',
  assertion: AssertionClass
): RunResult =>
  ({
    scenarioId: `pair-a-${corpus}`,
    armName,
    repetition,
    outcome: 'goal-reached',
    transcript: [],
    turns: [],
    totals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      turns: 1,
      toolCalls: 0,
      wallMs: 0,
    },
    deterministic: { mentioned: [], missing: [], forbidden: [], pass: true, skipped: false },
    flip: { pairId: 'pair-a', corpus, assertion },
    score: 1,
  }) as RunResult

describe('pairFlipRuns', () => {
  it('pairs the two halves by arm and repetition', () => {
    const pairs = pairFlipRuns([
      makeRun('knowledge-box', 0, 'positive', 'asserted-needle'),
      makeRun('knowledge-box', 0, 'negative', 'abstained'),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.verdict).toBe('coverage')
  })

  it('does not pair runs from different arms', () => {
    expect(
      pairFlipRuns([
        makeRun('knowledge-box', 0, 'positive', 'asserted-needle'),
        makeRun('all-in-context', 0, 'negative', 'abstained'),
      ])
    ).toHaveLength(0)
  })

  it('drops a half with no counterpart rather than guessing one', () => {
    expect(pairFlipRuns([makeRun('knowledge-box', 0, 'positive', 'asserted-needle')])).toHaveLength(
      0
    )
  })

  it('ignores runs from scenarios that are not flip tests', () => {
    const plain = { ...makeRun('knowledge-box', 0, 'positive', 'asserted-needle'), flip: undefined }
    expect(pairFlipRuns([plain])).toHaveLength(0)
  })

  it('does not credit coverage when the positive answer failed its answer key', () => {
    const positive = makeRun('knowledge-box', 0, 'positive', 'asserted-needle')
    positive.deterministic = {
      mentioned: ['1.80%'],
      missing: [],
      forbidden: ['2.15%'],
      pass: false,
      skipped: false,
    }
    const pairs = pairFlipRuns([positive, makeRun('knowledge-box', 0, 'negative', 'abstained')])
    expect(pairs[0]!.verdict).toBe('positive-failure')
  })

  it('does not credit coverage when the positive conversation never completed', () => {
    const positive = makeRun('knowledge-box', 0, 'positive', 'asserted-needle')
    positive.outcome = 'max-turns'
    const pairs = pairFlipRuns([positive, makeRun('knowledge-box', 0, 'negative', 'abstained')])
    expect(pairs[0]!.verdict).toBe('positive-failure')
  })
})

describe('summarizeFlip', () => {
  it('reports coverage and hallucination as rates over repetitions', () => {
    const summary = summarizeFlip([
      makeRun('knowledge-box', 0, 'positive', 'asserted-needle'),
      makeRun('knowledge-box', 0, 'negative', 'abstained'),
      makeRun('knowledge-box', 1, 'positive', 'asserted-needle'),
      makeRun('knowledge-box', 1, 'negative', 'abstained'),
      makeRun('knowledge-box', 2, 'positive', 'asserted-needle'),
      makeRun('knowledge-box', 2, 'negative', 'asserted-other'),
    ])

    expect(summary).toHaveLength(1)
    expect(summary[0]!.pairs).toBe(3)
    expect(summary[0]!.coverageRate).toBeCloseTo(2 / 3)
    expect(summary[0]!.hallucinationRate).toBeCloseTo(1 / 3)
  })

  it('keeps arms separate', () => {
    const summary = summarizeFlip([
      makeRun('knowledge-box', 0, 'positive', 'asserted-needle'),
      makeRun('knowledge-box', 0, 'negative', 'abstained'),
      makeRun('all-in-context', 0, 'positive', 'asserted-needle'),
      makeRun('all-in-context', 0, 'negative', 'asserted-needle'),
    ])
    expect(summary).toHaveLength(2)
    expect(summary.find((entry) => entry.armName === 'knowledge-box')!.coverageRate).toBe(1)
    expect(summary.find((entry) => entry.armName === 'all-in-context')!.coverageRate).toBe(0)
  })
})

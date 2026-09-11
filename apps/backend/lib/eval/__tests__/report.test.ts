import { describe, expect, it } from 'vitest'
import { aggregate, compare, computeBreakEven, renderMarkdown } from '@/backend/lib/eval/report'
import type { ArmAggregate } from '@/backend/lib/eval/report'
import type { RunResult } from '@/backend/lib/eval/types'

const makeRun = (overrides: Partial<RunResult> & Pick<RunResult, 'armName'>): RunResult => ({
  scenarioId: 'scenario-1',
  repetition: 0,
  outcome: 'goal-reached',
  transcript: [{ role: 'assistant', text: 'answer' }],
  turns: [],
  totals: {
    inputTokens: 1000,
    outputTokens: 100,
    totalTokens: 1100,
    turns: 1,
    toolCalls: 0,
    wallMs: 100,
    costUsd: 0.001,
  },
  deterministic: { mentioned: [], missing: [], forbidden: [], pass: true, skipped: false },
  score: 1,
  ...overrides,
})

describe('aggregate', () => {
  it('groups by scenario and arm', () => {
    const result = aggregate([
      makeRun({ armName: 'a' }),
      makeRun({ armName: 'a', repetition: 1 }),
      makeRun({ armName: 'b' }),
    ])
    expect(result).toHaveLength(2)
    expect(result.find((entry) => entry.armName === 'a')!.runs).toBe(2)
  })

  it('counts a run that errored as a failure even if the answer key passed', () => {
    const result = aggregate([
      makeRun({ armName: 'a', outcome: 'error', error: 'boom', score: 0 }),
      makeRun({ armName: 'a', repetition: 1 }),
    ])
    expect(result[0]!.successRate).toBe(0.5)
    expect(result[0]!.errors).toEqual(['boom'])
  })

  it('marks cost as unknown when no run was priced', () => {
    const unpriced = makeRun({ armName: 'a' })
    unpriced.totals.costUsd = undefined
    expect(aggregate([unpriced])[0]!.costKnown).toBe(false)
  })

  it('takes the one-off setup cost from whichever run recorded it', () => {
    const result = aggregate([
      makeRun({ armName: 'a' }),
      makeRun({
        armName: 'a',
        repetition: 1,
        setupCost: { inputTokens: 10, outputTokens: 2, calls: 3, wallMs: 5 },
        setupCostUsd: 0.02,
      }),
    ])
    expect(result[0]!.setupCostUsd).toBe(0.02)
    expect(result[0]!.setupCalls).toBe(3)
  })
})

describe('computeBreakEven', () => {
  const aggregateWith = (costMean: number, setupCostUsd?: number): ArmAggregate =>
    ({
      scenarioId: 's',
      armName: 'x',
      runs: 3,
      successRate: 1,
      score: { n: 3, mean: 1, median: 1, min: 1, max: 1, stdev: 0 },
      inputTokens: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      outputTokens: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      cacheReadTokens: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      cacheWriteTokens: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      estimatedHistoryTokensBefore: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      estimatedHistoryTokensAfter: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      summarizedMessages: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      costUsd: { n: 3, mean: costMean, median: costMean, min: costMean, max: costMean, stdev: 0 },
      costKnown: true,
      turns: { n: 3, mean: 1, median: 1, min: 1, max: 1, stdev: 0 },
      toolCalls: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      wallMs: { n: 3, mean: 0, median: 0, min: 0, max: 0, stdev: 0 },
      setupCostUsd,
      errors: [],
    }) as ArmAggregate

  it('reports how many conversations repay the indexing cost', () => {
    // Saves $0.0006 per conversation, cost $0.003 to build: 5 conversations.
    const result = computeBreakEven(aggregateWith(0.001), aggregateWith(0.0004, 0.003))
    expect(result).toMatchObject({ savingPerRunUsd: expect.closeTo(0.0006, 10), queries: 5 })
  })

  it('rounds up, because half a conversation does not repay anything', () => {
    expect(computeBreakEven(aggregateWith(0.001), aggregateWith(0.0009, 0.00025))?.queries).toBe(3)
  })

  it('reports no break-even when the candidate is not cheaper per conversation', () => {
    const result = computeBreakEven(aggregateWith(0.001), aggregateWith(0.002, 0.003))
    expect(result?.queries).toBeUndefined()
    expect(result!.savingPerRunUsd).toBeLessThan(0)
  })

  it('does not describe a more expensive arm as saving a negative amount', () => {
    const markdown = renderMarkdown(
      [
        makeRun({ armName: 'baseline' }),
        makeRun({ armName: 'baseline', repetition: 1 }),
        makeRun({
          armName: 'candidate',
          totals: { ...makeRun({ armName: 'x' }).totals, costUsd: 0.002 },
        }),
        makeRun({
          armName: 'candidate',
          repetition: 1,
          totals: { ...makeRun({ armName: 'x' }).totals, costUsd: 0.002 },
        }),
      ],
      'baseline'
    )
    expect(markdown).toContain('costs')
    expect(markdown).not.toContain('saves $-')
  })

  it('breaks even immediately when there is nothing to repay', () => {
    expect(computeBreakEven(aggregateWith(0.001), aggregateWith(0.0004))?.queries).toBe(0)
  })

  it('declines to compute anything when either side is unpriced', () => {
    const unpriced = { ...aggregateWith(0), costKnown: false }
    expect(computeBreakEven(aggregateWith(0.001), unpriced)).toBeUndefined()
  })
})

describe('compare', () => {
  it('compares every arm against the named baseline and skips the baseline itself', () => {
    const runs = [
      makeRun({ armName: 'baseline' }),
      makeRun({ armName: 'baseline', repetition: 1 }),
      makeRun({ armName: 'candidate' }),
      makeRun({ armName: 'candidate', repetition: 1 }),
    ]
    const comparisons = compare(runs, 'baseline')
    expect(comparisons).toHaveLength(1)
    expect(comparisons[0]!.candidateArm).toBe('candidate')
  })

  it('returns nothing when the baseline arm was never run', () => {
    expect(compare([makeRun({ armName: 'candidate' })], 'baseline')).toEqual([])
  })
})

describe('renderMarkdown', () => {
  it('starts with an overall arm summary across scenarios', () => {
    const markdown = renderMarkdown(
      [
        makeRun({ armName: 'a' }),
        makeRun({ armName: 'a', scenarioId: 'scenario-2', repetition: 1 }),
      ],
      'a'
    )
    expect(markdown).toContain('## Overall')
    expect(markdown).toContain('| a | 2 | 100% |')
  })

  it('warns when there are too few repetitions to separate anything', () => {
    const markdown = renderMarkdown([makeRun({ armName: 'a' })], 'a')
    expect(markdown).toContain('distinguishable from noise')
  })

  it('drops the warning once every arm has repetitions', () => {
    const markdown = renderMarkdown(
      [makeRun({ armName: 'a' }), makeRun({ armName: 'a', repetition: 1 })],
      'a'
    )
    expect(markdown).not.toContain('distinguishable from noise')
  })

  it('says plainly when a difference is not separable', () => {
    const runs = [
      makeRun({ armName: 'baseline' }),
      makeRun({ armName: 'baseline', repetition: 1 }),
      makeRun({ armName: 'candidate' }),
      makeRun({ armName: 'candidate', repetition: 1 }),
    ]
    expect(renderMarkdown(runs, 'baseline')).toContain('not separable at this sample size')
  })

  it('does not claim a degenerate one-run interval includes zero when it does not', () => {
    const markdown = renderMarkdown(
      [
        makeRun({ armName: 'baseline' }),
        makeRun({
          armName: 'candidate',
          totals: { ...makeRun({ armName: 'candidate' }).totals, inputTokens: 500 },
        }),
      ],
      'baseline'
    )
    expect(markdown).toContain('fewer than two observations')
    expect(markdown).not.toContain('[-500, -500] includes 0')
  })

  it('lists errors so a silent failure cannot be mistaken for a bad score', () => {
    const markdown = renderMarkdown(
      [makeRun({ armName: 'a', outcome: 'error', error: 'tokenizer exploded', score: 0 })],
      'a'
    )
    expect(markdown).toContain('tokenizer exploded')
  })

  it('omits the flip section when no scenario was a flip test', () => {
    expect(renderMarkdown([makeRun({ armName: 'a' })], 'a')).not.toContain('Flip test')
  })

  it('reports coverage and hallucination once both halves of a pair have run', () => {
    const markdown = renderMarkdown(
      [
        makeRun({
          armName: 'a',
          scenarioId: 'p-positive',
          flip: { pairId: 'p', corpus: 'positive', assertion: 'asserted-needle' },
        }),
        makeRun({
          armName: 'a',
          scenarioId: 'p-negative',
          flip: { pairId: 'p', corpus: 'negative', assertion: 'asserted-other' },
        }),
      ],
      'a'
    )
    expect(markdown).toContain('Flip test')
    // Answered on both corpora: no coverage, and the negative answer was invented.
    expect(markdown).toContain('| p | a | 1 | 0% | 100% |')
  })

  it('warns when the positive half failed, so coverage is not read on its own', () => {
    const markdown = renderMarkdown(
      [
        makeRun({
          armName: 'a',
          scenarioId: 'p-positive',
          flip: { pairId: 'p', corpus: 'positive', assertion: 'exhausted' },
        }),
        makeRun({
          armName: 'a',
          scenarioId: 'p-negative',
          flip: { pairId: 'p', corpus: 'negative', assertion: 'abstained' },
        }),
      ],
      'a'
    )
    expect(markdown).toContain('carries no information')
  })

  it('shows inconclusive pairs instead of hiding them from the totals', () => {
    const markdown = renderMarkdown(
      [
        makeRun({
          armName: 'a',
          scenarioId: 'p-positive',
          flip: { pairId: 'p', corpus: 'positive', assertion: 'asserted-needle' },
        }),
        makeRun({
          armName: 'a',
          scenarioId: 'p-negative',
          flip: { pairId: 'p', corpus: 'negative', assertion: 'error' },
        }),
      ],
      'a'
    )
    expect(markdown).toContain('inconclusive')
    expect(markdown).toContain('| p | a | 1 | 0% | 0% | 0 | 0 | 0 | 1 |')
  })
})

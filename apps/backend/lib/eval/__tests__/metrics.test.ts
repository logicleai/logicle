import { describe, expect, it } from 'vitest'
import { checkAnswerKey, computeTotals, scoreRun } from '@/backend/lib/eval/metrics'
import { computeCostUsd, formatCostUsd, resolveModelPrice } from '@/backend/lib/eval/cost'
import type { TranscriptEntry, TurnMetrics } from '@/backend/lib/eval/types'

const transcript = (...entries: [string, string][]): TranscriptEntry[] =>
  entries.map(([role, text]) => ({ role: role as TranscriptEntry['role'], text }))

describe('resolveModelPrice', () => {
  it('matches a known model exactly', () => {
    expect(resolveModelPrice('gpt-4o-mini')).toEqual({ input: 0.15, output: 0.6 })
  })

  it('is case-insensitive', () => {
    expect(resolveModelPrice('GPT-4o-Mini')).toEqual({ input: 0.15, output: 0.6 })
  })

  it('falls back to the longest matching prefix for a dated snapshot', () => {
    // Must resolve to gpt-4o-mini, not to the shorter gpt-4o.
    expect(resolveModelPrice('gpt-4o-mini-2024-07-18')).toEqual({ input: 0.15, output: 0.6 })
  })

  it('strips a vendor prefix', () => {
    expect(resolveModelPrice('openai/gpt-4o')).toEqual({ input: 2.5, output: 10.0 })
  })

  it('returns undefined for an unknown model rather than guessing', () => {
    expect(resolveModelPrice('some-model-nobody-has-priced')).toBeUndefined()
  })
})

describe('computeCostUsd', () => {
  it('prices input and output separately', () => {
    // 1M input at $0.15 plus 1M output at $0.60.
    expect(computeCostUsd('gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.75, 6)
  })

  it('degrades to undefined for an unpriced model instead of reporting zero', () => {
    expect(computeCostUsd('mystery-model', 1000, 1000)).toBeUndefined()
  })
})

describe('formatCostUsd', () => {
  it('marks an unknown cost as not available', () => {
    expect(formatCostUsd(undefined)).toBe('n/a')
  })

  it('keeps small costs readable instead of rounding them away', () => {
    expect(formatCostUsd(0.00035)).toBe('$0.00035')
  })

  it('formats zero plainly', () => {
    expect(formatCostUsd(0)).toBe('$0')
  })
})

describe('checkAnswerKey', () => {
  it('is skipped when the scenario declares no key', () => {
    const verdict = checkAnswerKey(transcript(['assistant', 'anything']), undefined)
    expect(verdict).toMatchObject({ pass: true, skipped: true })
  })

  it('passes when every required string is present', () => {
    const verdict = checkAnswerKey(transcript(['assistant', 'The rate is 2.4% per month.']), {
      mustMention: ['2.4%'],
    })
    expect(verdict).toMatchObject({ pass: true, skipped: false, mentioned: ['2.4%'], missing: [] })
  })

  it('fails and names what was missing', () => {
    const verdict = checkAnswerKey(transcript(['assistant', 'I could not find it.']), {
      mustMention: ['2.4%', '30 days'],
    })
    expect(verdict.pass).toBe(false)
    expect(verdict.missing).toEqual(['2.4%', '30 days'])
  })

  it('fails when a forbidden distractor is quoted', () => {
    const verdict = checkAnswerKey(transcript(['assistant', 'The rate is 0.9% per month.']), {
      mustMention: ['2.4%'],
      mustNotMention: ['0.9%'],
    })
    expect(verdict.pass).toBe(false)
    expect(verdict.forbidden).toEqual(['0.9%'])
  })

  it('ignores what the user said, so a leaked answer cannot pass the check', () => {
    const verdict = checkAnswerKey(
      transcript(['user', 'Is it 2.4% per month?'], ['assistant', 'I have no idea.']),
      { mustMention: ['2.4%'] }
    )
    expect(verdict.pass).toBe(false)
  })

  it('survives line wrapping between the words of a required phrase', () => {
    const verdict = checkAnswerKey(
      transcript(['assistant', 'Payment is due within\n  30   days of invoice.']),
      { mustMention: ['30 days'] }
    )
    expect(verdict.pass).toBe(true)
  })
})

describe('computeTotals', () => {
  const turns: TurnMetrics[] = [
    {
      inputTokens: 1000,
      outputTokens: 100,
      totalTokens: 1100,
      toolCalls: ['search'],
      latencyMs: 10,
    },
    {
      inputTokens: 2000,
      outputTokens: 200,
      totalTokens: 2200,
      toolCalls: ['read', 'search'],
      latencyMs: 20,
    },
  ]

  it('sums tokens, turns and tool calls across the conversation', () => {
    const totals = computeTotals(turns, 'gpt-4o-mini', 999)
    expect(totals).toMatchObject({
      inputTokens: 3000,
      outputTokens: 300,
      totalTokens: 3300,
      turns: 2,
      toolCalls: 3,
      wallMs: 999,
    })
  })

  it('prices the conversation when the model is known', () => {
    expect(computeTotals(turns, 'gpt-4o-mini', 0).costUsd).toBeCloseTo(
      (3000 * 0.15 + 300 * 0.6) / 1_000_000,
      10
    )
  })

  it('leaves cost undefined for an unpriced model', () => {
    expect(computeTotals(turns, 'mystery-model', 0).costUsd).toBeUndefined()
  })

  it('handles a conversation that never got a turn in', () => {
    expect(computeTotals([], 'gpt-4o-mini', 5)).toMatchObject({
      inputTokens: 0,
      turns: 0,
      toolCalls: 0,
    })
  })
})

describe('scoreRun', () => {
  const pass = { mentioned: [], missing: [], forbidden: [], pass: true, skipped: false }
  const fail = { mentioned: [], missing: ['2.4%'], forbidden: [], pass: false, skipped: false }
  const skipped = { mentioned: [], missing: [], forbidden: [], pass: true, skipped: true }

  it('scores an errored run zero regardless of anything else', () => {
    expect(
      scoreRun({ outcome: 'error', deterministic: pass, judge: { score: 1, reasoning: '' } })
    ).toBe(0)
  })

  it('treats a missing required fact as a hard failure, not a deduction', () => {
    expect(
      scoreRun({
        outcome: 'goal-reached',
        deterministic: fail,
        judge: { score: 0.9, reasoning: 'sounded great' },
      })
    ).toBe(0)
  })

  it('uses the judge for runs that cleared the answer key', () => {
    expect(
      scoreRun({
        outcome: 'goal-reached',
        deterministic: pass,
        judge: { score: 0.7, reasoning: '' },
      })
    ).toBe(0.7)
  })

  it('clamps a judge score outside [0, 1]', () => {
    expect(
      scoreRun({ outcome: 'goal-reached', deterministic: pass, judge: { score: 5, reasoning: '' } })
    ).toBe(1)
  })

  it('falls back to the outcome when there is no judge', () => {
    expect(scoreRun({ outcome: 'goal-reached', deterministic: skipped })).toBe(1)
    expect(scoreRun({ outcome: 'gave-up', deterministic: skipped })).toBe(0)
    expect(scoreRun({ outcome: 'max-turns', deterministic: skipped })).toBe(0)
  })
})

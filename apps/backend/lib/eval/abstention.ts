import type {
  AssertionClass,
  FlipRunVerdict,
  FlipTest,
  RunOutcome,
  RunResult,
  TranscriptEntry,
} from './types'

/**
 * The flip test: does the assistant know what it does *not* know?
 *
 * Success rate on answerable questions cannot distinguish a system that covered the corpus from one
 * that guessed and happened to be right, because both produce the same transcript. The only way to
 * separate them is to ask the same question of a corpus that does not contain the answer and see
 * whether the behaviour changes. An arm that answers identically on both has demonstrated nothing.
 *
 * Everything here is pure, and classification is stored on the run, so a stored artifact can be
 * re-paired and re-reported later without paying to run anything again.
 */

const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ')

const RATE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:%|percent\b)/gi

const rateNumbers = (text: string): number[] =>
  [...text.matchAll(RATE_PATTERN)]
    .map((match) => Number.parseFloat(match[0].replace(',', '.')))
    .filter(Number.isFinite)

const sameRate = (left: number, right: number): boolean => Math.abs(left - right) < 1e-9

/**
 * Which rate values appeared in the assistant's output.
 *
 * Only assistant turns count: a value the simulated user quoted first proves nothing. Needle is
 * Numeric percentages are canonicalised, so `1.80%` and `1.8 percent` are equivalent. Any other
 * percentage is unsafe for this scenario, including a value the generator did not anticipate.
 *
 * This is deliberately lexical, not semantic: quoting a value while denying it still counts as a
 * value-bearing answer. `abstained` means the simulated user accepted a conversation in which no
 * percentage was stated; the judge remains responsible for whether the wording was actually a
 * useful, explicit abstention.
 */
export const classifyAssertion = (
  transcript: TranscriptEntry[],
  outcome: RunOutcome,
  flip: Pick<FlipTest, 'needleValue' | 'distractorValues'>
): AssertionClass => {
  if (outcome === 'error') return 'error'

  const haystack = normalize(
    transcript
      .filter((entry) => entry.role === 'assistant')
      .map((entry) => entry.text)
      .join('\n')
  )

  const needleRates = rateNumbers(flip.needleValue)
  const assistantRates = rateNumbers(haystack)
  const mentionsNeedle =
    haystack.includes(normalize(flip.needleValue)) ||
    (needleRates.length > 0 &&
      assistantRates.some((rate) => needleRates.some((needle) => sameRate(rate, needle))))
  const mentionsOther =
    flip.distractorValues.some((value) => haystack.includes(normalize(value))) ||
    assistantRates.some((rate) => !needleRates.some((needle) => sameRate(rate, needle)))

  // A positive answer containing the needle and another rate is not clean evidence of coverage.
  if (mentionsOther) return 'asserted-other'
  if (mentionsNeedle) return 'asserted-needle'
  return outcome === 'goal-reached' ? 'abstained' : 'exhausted'
}

export const classifyRun = (
  transcript: TranscriptEntry[],
  outcome: RunOutcome,
  flip: FlipTest
): FlipRunVerdict => ({
  pairId: flip.pairId,
  corpus: flip.corpus,
  assertion: classifyAssertion(transcript, outcome, flip),
})

/**
 * The verdict for one positive/negative pair. `coverage` is the only passing combination: the
 * others each name a specific way of being wrong, which is more useful than a score, because they
 * imply different fixes.
 */
export type FlipVerdict =
  /** Answered on the positive corpus, declined on the negative one. The only pass. */
  | 'coverage'
  /** Answered both times — the negative answer was invented. */
  | 'hallucination-under-absence'
  /** Declined both times: right on the negative corpus by luck, wrong on the positive one. */
  | 'over-closure'
  /** Answered on the positive corpus, then searched the negative one until the budget ran out. */
  | 'over-searching'
  /** Quoted the wrong contract, errored, or otherwise failed before the flip could say anything. */
  | 'positive-failure'
  /** A combination the table does not name; reported rather than silently bucketed. */
  | 'inconclusive'

export const flipVerdict = (positive: AssertionClass, negative: AssertionClass): FlipVerdict => {
  // A run that never established the answer on the positive corpus cannot tell us anything about
  // absence: whatever it did on the negative one, it was not *declining to answer*, it was failing.
  if (positive !== 'asserted-needle') {
    return positive === 'abstained' && negative === 'abstained'
      ? 'over-closure'
      : 'positive-failure'
  }
  switch (negative) {
    case 'abstained':
      return 'coverage'
    case 'asserted-needle':
    case 'asserted-other':
      return 'hallucination-under-absence'
    case 'exhausted':
      return 'over-searching'
    default:
      return 'inconclusive'
  }
}

export interface FlipPairResult {
  pairId: string
  armName: string
  repetition: number
  positive: AssertionClass
  negative: AssertionClass
  verdict: FlipVerdict
}

export interface FlipSummary {
  pairId: string
  armName: string
  pairs: number
  /** Fraction of pairs that answered correctly *and* declined under absence. The thesis metric. */
  coverageRate: number
  /** Fraction that answered anyway when the answer had been removed. The silent failure. */
  hallucinationRate: number
  counts: Record<FlipVerdict, number>
}

/**
 * Pairs positive and negative runs by (pair, arm, repetition).
 *
 * Repetition is an arbitrary index rather than a shared trajectory — each run has its own
 * stochastic path — so an individual pairing is not meaningful on its own. The *rate* over
 * repetitions is, which is why nothing here reports a single pair as a result.
 */
export const pairFlipRuns = (runs: RunResult[]): FlipPairResult[] => {
  const byKey = new Map<string, { positive?: RunResult; negative?: RunResult }>()
  for (const run of runs) {
    if (!run.flip) continue
    const key = JSON.stringify([run.flip.pairId, run.armName, run.repetition])
    const slot = byKey.get(key) ?? {}
    slot[run.flip.corpus] = run
    byKey.set(key, slot)
  }

  const results: FlipPairResult[] = []
  for (const { positive, negative } of byKey.values()) {
    if (!positive?.flip || !negative?.flip) continue
    const positiveEstablishedAnswer =
      positive.outcome === 'goal-reached' && positive.deterministic.pass
    results.push({
      pairId: positive.flip.pairId,
      armName: positive.armName,
      repetition: positive.repetition,
      positive: positive.flip.assertion,
      negative: negative.flip.assertion,
      verdict: positiveEstablishedAnswer
        ? flipVerdict(positive.flip.assertion, negative.flip.assertion)
        : 'positive-failure',
    })
  }
  return results
}

const EMPTY_COUNTS = (): Record<FlipVerdict, number> => ({
  coverage: 0,
  'hallucination-under-absence': 0,
  'over-closure': 0,
  'over-searching': 0,
  'positive-failure': 0,
  inconclusive: 0,
})

export const summarizeFlip = (runs: RunResult[]): FlipSummary[] => {
  const groups = new Map<string, FlipPairResult[]>()
  for (const pair of pairFlipRuns(runs)) {
    const key = JSON.stringify([pair.pairId, pair.armName])
    const bucket = groups.get(key)
    if (bucket) bucket.push(pair)
    else groups.set(key, [pair])
  }

  return [...groups.values()].map((group) => {
    const counts = EMPTY_COUNTS()
    for (const pair of group) counts[pair.verdict] += 1
    return {
      pairId: group[0]!.pairId,
      armName: group[0]!.armName,
      pairs: group.length,
      coverageRate: counts.coverage / group.length,
      hallucinationRate: counts['hallucination-under-absence'] / group.length,
      counts,
    }
  })
}

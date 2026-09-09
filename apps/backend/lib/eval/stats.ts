/**
 * The statistics needed to not lie about an LLM benchmark.
 *
 * Runs of the same scenario against the same arm vary a lot: the model phrases things
 * differently, calls one tool more or fewer times, and the token count moves with it. Reporting a
 * single run per arm and declaring a winner is the main way benchmarks like this mislead, so
 * everything here is built around "how confident can we be that the arms actually differ".
 *
 * The estimator is a bootstrap rather than a t-test: sample sizes are small, cost and token
 * distributions are skewed and bounded below, and a percentile bootstrap needs no distributional
 * assumption and no special functions. The RNG is seeded so a report is reproducible.
 */

export interface Summary {
  n: number
  mean: number
  median: number
  min: number
  max: number
  /** Sample standard deviation (n-1). Zero when n < 2. */
  stdev: number
}

/**
 * Small deterministic PRNG (mulberry32). Seeded so that re-rendering a report from the same runs
 * produces the same intervals — a confidence interval that moves when you look at it twice is
 * worse than no interval at all.
 */
export const makeRng = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const summarize = (values: number[]): Summary => {
  if (values.length === 0) {
    return { n: 0, mean: 0, median: 0, min: 0, max: 0, stdev: 0 }
  }
  const sorted = [...values].sort((left, right) => left - right)
  const n = sorted.length
  const mean = sorted.reduce((total, value) => total + value, 0) / n
  const middle = Math.floor(n / 2)
  const median = n % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
  const variance =
    n < 2 ? 0 : sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / (n - 1)
  return { n, mean, median, min: sorted[0]!, max: sorted[n - 1]!, stdev: Math.sqrt(variance) }
}

export interface DifferenceEstimate {
  /** meanB - meanA. */
  delta: number
  /** Percentile bootstrap interval for `delta`. */
  ciLow: number
  ciHigh: number
  /**
   * True when the interval excludes zero — i.e. the sample supports claiming a direction. With the
   * handful of repetitions these runs can afford this is usually false, and saying so plainly is
   * the point.
   */
  separable: boolean
  /** `delta` as a fraction of meanA, when meanA is non-zero. */
  relative?: number
}

const BOOTSTRAP_RESAMPLES = 2000

const resampleMean = (values: number[], rng: () => number): number => {
  let total = 0
  for (let i = 0; i < values.length; i++) {
    total += values[Math.floor(rng() * values.length)]!
  }
  return total / values.length
}

/**
 * Percentile bootstrap for the difference in means between two arms, at 95%.
 *
 * Returns `separable: false` whenever either sample has fewer than two observations: one run per
 * arm cannot support a claim, and the report must say so instead of quietly emitting a degenerate
 * zero-width interval.
 */
export const estimateDifference = (
  baseline: number[],
  candidate: number[],
  options: { seed?: number; resamples?: number } = {}
): DifferenceEstimate => {
  const meanA = summarize(baseline).mean
  const meanB = summarize(candidate).mean
  const delta = meanB - meanA
  const relative = meanA === 0 ? undefined : delta / meanA

  if (baseline.length < 2 || candidate.length < 2) {
    return { delta, ciLow: delta, ciHigh: delta, separable: false, relative }
  }

  const rng = makeRng(options.seed ?? 0x5eed)
  const resamples = options.resamples ?? BOOTSTRAP_RESAMPLES
  const deltas: number[] = []
  for (let i = 0; i < resamples; i++) {
    deltas.push(resampleMean(candidate, rng) - resampleMean(baseline, rng))
  }
  deltas.sort((left, right) => left - right)

  const ciLow = deltas[Math.floor(0.025 * (deltas.length - 1))]!
  const ciHigh = deltas[Math.ceil(0.975 * (deltas.length - 1))]!
  return { delta, ciLow, ciHigh, separable: ciLow > 0 || ciHigh < 0, relative }
}

import { describe, expect, it } from 'vitest'
import { estimateDifference, makeRng, summarize } from '@/backend/lib/eval/stats'

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const first = Array.from({ length: 5 }, makeRng(42))
    const second = Array.from({ length: 5 }, makeRng(42))
    expect(first).toEqual(second)
  })

  it('produces different streams for different seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)())
  })

  it('stays inside [0, 1)', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 500; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('summarize', () => {
  it('handles an empty sample without dividing by zero', () => {
    expect(summarize([])).toEqual({ n: 0, mean: 0, median: 0, min: 0, max: 0, stdev: 0 })
  })

  it('reports a single observation with zero spread', () => {
    expect(summarize([5])).toEqual({ n: 1, mean: 5, median: 5, min: 5, max: 5, stdev: 0 })
  })

  it('takes the midpoint for an even-sized sample', () => {
    expect(summarize([1, 2, 3, 4]).median).toBe(2.5)
  })

  it('takes the middle value for an odd-sized sample', () => {
    expect(summarize([3, 1, 2]).median).toBe(2)
  })

  it('computes the sample standard deviation', () => {
    // Population stdev of [2,4,4,4,5,5,7,9] is 2; the sample (n-1) value is slightly larger.
    expect(summarize([2, 4, 4, 4, 5, 5, 7, 9]).stdev).toBeCloseTo(2.138, 3)
  })

  it('does not mutate its input', () => {
    const values = [3, 1, 2]
    summarize(values)
    expect(values).toEqual([3, 1, 2])
  })
})

describe('estimateDifference', () => {
  it('refuses to claim separability with fewer than two observations per arm', () => {
    const estimate = estimateDifference([100], [10])
    expect(estimate.delta).toBe(-90)
    expect(estimate.separable).toBe(false)
    expect(estimate.ciLow).toBe(estimate.ciHigh)
  })

  it('separates two clearly different samples', () => {
    const baseline = [100, 102, 98, 101, 99]
    const candidate = [40, 42, 38, 41, 39]
    const estimate = estimateDifference(baseline, candidate)
    expect(estimate.delta).toBeCloseTo(-60, 0)
    expect(estimate.separable).toBe(true)
    expect(estimate.ciHigh).toBeLessThan(0)
  })

  it('does not separate two overlapping samples', () => {
    const baseline = [100, 60, 140, 80, 120]
    const candidate = [110, 70, 130, 90, 100]
    expect(estimateDifference(baseline, candidate).separable).toBe(false)
  })

  it('reports the difference relative to the baseline mean', () => {
    const estimate = estimateDifference([100, 100, 100, 100], [50, 50, 50, 50])
    expect(estimate.relative).toBeCloseTo(-0.5, 6)
  })

  it('omits the relative figure when the baseline mean is zero', () => {
    expect(estimateDifference([0, 0], [1, 2]).relative).toBeUndefined()
  })

  it('is reproducible for a given seed', () => {
    const baseline = [10, 12, 9, 15, 11]
    const candidate = [8, 14, 7, 13, 10]
    const first = estimateDifference(baseline, candidate, { seed: 99 })
    const second = estimateDifference(baseline, candidate, { seed: 99 })
    expect(first).toEqual(second)
  })

  it('brackets the observed delta with its interval', () => {
    const baseline = [10, 12, 9, 15, 11]
    const candidate = [4, 6, 5, 7, 5]
    const estimate = estimateDifference(baseline, candidate)
    expect(estimate.ciLow).toBeLessThanOrEqual(estimate.delta)
    expect(estimate.ciHigh).toBeGreaterThanOrEqual(estimate.delta)
  })
})

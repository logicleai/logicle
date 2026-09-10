import { formatCostUsd } from './cost'
import { estimateDifference, summarize, type DifferenceEstimate, type Summary } from './stats'
import type { RunResult } from './types'

/**
 * Aggregation and rendering.
 *
 * Everything here is pure so a report can be regenerated from stored runs without paying to
 * re-run anything, and so the arithmetic that decides "arm B is cheaper" is unit-testable.
 */

export interface ArmAggregate {
  scenarioId: string
  armName: string
  runs: number
  /** Fraction of runs that cleared the answer key and did not error. */
  successRate: number
  /** Mean of the combined score, which folds in the judge when there is one. */
  score: Summary
  inputTokens: Summary
  outputTokens: Summary
  cacheReadTokens: Summary
  cacheWriteTokens: Summary
  estimatedHistoryTokensBefore: Summary
  estimatedHistoryTokensAfter: Summary
  summarizedMessages: Summary
  costUsd: Summary
  /** Undefined when no run had a known price. */
  costKnown: boolean
  turns: Summary
  toolCalls: Summary
  wallMs: Summary
  /** One-off preparation cost, identical across repetitions; taken from the first run that has it. */
  setupCostUsd?: number
  setupCalls?: number
  errors: string[]
}

export const aggregate = (runs: RunResult[]): ArmAggregate[] => {
  const groups = new Map<string, RunResult[]>()
  for (const run of runs) {
    const key = `${run.scenarioId}\u0000${run.armName}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(run)
    else groups.set(key, [run])
  }

  return [...groups.values()].map((group) => {
    const first = group[0]!
    const withCost = group.filter((run) => run.totals.costUsd !== undefined)
    const setupRun = group.find((run) => run.setupCost !== undefined)
    return {
      scenarioId: first.scenarioId,
      armName: first.armName,
      runs: group.length,
      successRate:
        group.filter((run) => run.outcome !== 'error' && run.deterministic.pass).length /
        group.length,
      score: summarize(group.map((run) => run.score)),
      inputTokens: summarize(group.map((run) => run.totals.inputTokens)),
      outputTokens: summarize(group.map((run) => run.totals.outputTokens)),
      cacheReadTokens: summarize(
        group.map((run) => run.totals.inputTokenDetails?.cacheReadTokens ?? 0)
      ),
      cacheWriteTokens: summarize(
        group.map((run) => run.totals.inputTokenDetails?.cacheWriteTokens ?? 0)
      ),
      estimatedHistoryTokensBefore: summarize(
        group.map((run) => run.compression?.estimatedHistoryTokensBefore ?? 0)
      ),
      estimatedHistoryTokensAfter: summarize(
        group.map((run) => run.compression?.estimatedHistoryTokensAfter ?? 0)
      ),
      summarizedMessages: summarize(group.map((run) => run.compression?.summarizedMessages ?? 0)),
      costUsd: summarize(withCost.map((run) => run.totals.costUsd!)),
      costKnown: withCost.length > 0,
      turns: summarize(group.map((run) => run.totals.turns)),
      toolCalls: summarize(group.map((run) => run.totals.toolCalls)),
      wallMs: summarize(group.map((run) => run.totals.wallMs)),
      setupCostUsd: setupRun?.setupCostUsd,
      setupCalls: setupRun?.setupCost?.calls,
      errors: group
        .map((run) => run.error)
        .filter((message): message is string => Boolean(message)),
    }
  })
}

export interface BreakEven {
  /** Extra one-off cost the candidate pays before answering anything. */
  setupDeltaUsd: number
  /** What the candidate saves on each conversation, relative to the baseline. */
  savingPerRunUsd: number
  /**
   * Conversations needed before the candidate is cheaper overall. Undefined when it never is —
   * either because it saves nothing per run, or because it costs more.
   */
  queries?: number
}

/**
 * How many conversations an index has to serve before it has paid for itself.
 *
 * This is the number that decides whether a knowledge box is worth building: it is cheap to query
 * and expensive to prepare, so quoting only the per-conversation saving would flatter it. A box
 * that breaks even after four conversations is obviously worth it; one that breaks even after
 * eight hundred is not, and the per-conversation figures look identical in both cases.
 */
export const computeBreakEven = (
  baseline: ArmAggregate,
  candidate: ArmAggregate
): BreakEven | undefined => {
  if (!baseline.costKnown || !candidate.costKnown) return undefined
  const setupDeltaUsd = (candidate.setupCostUsd ?? 0) - (baseline.setupCostUsd ?? 0)
  const savingPerRunUsd = baseline.costUsd.mean - candidate.costUsd.mean
  if (savingPerRunUsd <= 0) return { setupDeltaUsd, savingPerRunUsd }
  if (setupDeltaUsd <= 0) return { setupDeltaUsd, savingPerRunUsd, queries: 0 }
  return { setupDeltaUsd, savingPerRunUsd, queries: Math.ceil(setupDeltaUsd / savingPerRunUsd) }
}

export interface Comparison {
  scenarioId: string
  baselineArm: string
  candidateArm: string
  cost: DifferenceEstimate
  inputTokens: DifferenceEstimate
  score: DifferenceEstimate
  breakEven?: BreakEven
}

export const compare = (
  runs: RunResult[],
  baselineArmName: string,
  seed = 0x5eed
): Comparison[] => {
  const aggregates = aggregate(runs)
  const scenarios = [...new Set(runs.map((run) => run.scenarioId))]
  const comparisons: Comparison[] = []

  for (const scenarioId of scenarios) {
    const scenarioRuns = runs.filter((run) => run.scenarioId === scenarioId)
    const baselineRuns = scenarioRuns.filter((run) => run.armName === baselineArmName)
    if (baselineRuns.length === 0) continue
    const baselineAggregate = aggregates.find(
      (entry) => entry.scenarioId === scenarioId && entry.armName === baselineArmName
    )!

    for (const armName of new Set(scenarioRuns.map((run) => run.armName))) {
      if (armName === baselineArmName) continue
      const candidateRuns = scenarioRuns.filter((run) => run.armName === armName)
      const candidateAggregate = aggregates.find(
        (entry) => entry.scenarioId === scenarioId && entry.armName === armName
      )!
      comparisons.push({
        scenarioId,
        baselineArm: baselineArmName,
        candidateArm: armName,
        cost: estimateDifference(
          baselineRuns.map((run) => run.totals.costUsd ?? 0),
          candidateRuns.map((run) => run.totals.costUsd ?? 0),
          { seed }
        ),
        inputTokens: estimateDifference(
          baselineRuns.map((run) => run.totals.inputTokens),
          candidateRuns.map((run) => run.totals.inputTokens),
          { seed }
        ),
        score: estimateDifference(
          baselineRuns.map((run) => run.score),
          candidateRuns.map((run) => run.score),
          { seed }
        ),
        breakEven: computeBreakEven(baselineAggregate, candidateAggregate),
      })
    }
  }

  return comparisons
}

const percent = (value: number): string => `${(value * 100).toFixed(0)}%`
const round = (value: number, digits = 1): string => value.toFixed(digits)

const renderDelta = (
  label: string,
  estimate: DifferenceEstimate,
  format: (n: number) => string
) => {
  const direction = estimate.delta === 0 ? '=' : estimate.delta < 0 ? '▼' : '▲'
  const relative =
    estimate.relative === undefined
      ? ''
      : ` (${estimate.relative > 0 ? '+' : ''}${percent(estimate.relative)})`
  const confidence = estimate.separable
    ? `95% CI [${format(estimate.ciLow)}, ${format(estimate.ciHigh)}]`
    : `not separable at this sample size — 95% CI [${format(estimate.ciLow)}, ${format(
        estimate.ciHigh
      )}] includes 0`
  return `- ${label}: ${direction} ${format(estimate.delta)}${relative} — ${confidence}`
}

export const renderMarkdown = (runs: RunResult[], baselineArmName: string): string => {
  const aggregates = aggregate(runs)
  const lines: string[] = ['# Evaluation report', '']

  const overall = aggregate(runs.map((run) => ({ ...run, scenarioId: 'overall' })))
  if (overall.length > 0) {
    lines.push(
      '## Overall',
      '',
      '| arm | runs | success | score | in tok | cache read | out tok | cost | tools |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
    )
    for (const entry of overall) {
      lines.push(
        `| ${entry.armName} | ${entry.runs} | ${percent(entry.successRate)} | ${round(
          entry.score.mean,
          2
        )} | ${round(entry.inputTokens.mean, 0)} | ${round(
          entry.cacheReadTokens.mean,
          0
        )} | ${round(entry.outputTokens.mean, 0)} | ${
          entry.costKnown ? formatCostUsd(entry.costUsd.mean) : 'n/a'
        } | ${round(entry.toolCalls.mean)} |`
      )
    }
    lines.push('')
  }

  for (const scenarioId of [...new Set(runs.map((run) => run.scenarioId))]) {
    const scenarioAggregates = aggregates.filter((entry) => entry.scenarioId === scenarioId)
    const showCompression = runs.some(
      (run) => run.scenarioId === scenarioId && run.compression !== undefined
    )
    lines.push(`## ${scenarioId}`, '')
    lines.push(
      showCompression
        ? '| arm | runs | success | score | history est. before→after | summarized | in tok | cache read | out tok | cost | tools | turns | setup |'
        : '| arm | runs | success | score | in tok | cache read | out tok | cost | tools | turns | setup |',
      showCompression
        ? '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
        : '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
    )
    for (const entry of scenarioAggregates) {
      const compressionColumns = showCompression
        ? ` ${round(entry.estimatedHistoryTokensBefore.mean, 0)}→${round(
            entry.estimatedHistoryTokensAfter.mean,
            0
          )} | ${round(entry.summarizedMessages.mean)} |`
        : ''
      lines.push(
        `| ${entry.armName} | ${entry.runs} | ${percent(entry.successRate)} | ${round(
          entry.score.mean,
          2
        )} |${compressionColumns} ${round(entry.inputTokens.mean, 0)} | ${round(
          entry.cacheReadTokens.mean,
          0
        )} | ${round(entry.outputTokens.mean, 0)} | ${
          entry.costKnown ? formatCostUsd(entry.costUsd.mean) : 'n/a'
        } | ${round(entry.toolCalls.mean)} | ${round(entry.turns.mean)} | ${
          entry.setupCostUsd !== undefined ? formatCostUsd(entry.setupCostUsd) : '—'
        } |`
      )
    }
    lines.push('')

    const comparisons = compare(
      runs.filter((run) => run.scenarioId === scenarioId),
      baselineArmName
    )
    for (const comparison of comparisons) {
      lines.push(`### ${comparison.candidateArm} vs ${comparison.baselineArm}`, '')
      lines.push(renderDelta('cost per conversation', comparison.cost, formatCostUsd))
      lines.push(
        renderDelta('input tokens per conversation', comparison.inputTokens, (n) => round(n, 0))
      )
      lines.push(renderDelta('score', comparison.score, (n) => round(n, 2)))
      if (comparison.breakEven) {
        const { setupDeltaUsd, savingPerRunUsd, queries } = comparison.breakEven
        lines.push(
          queries === undefined
            ? savingPerRunUsd <= 0
              ? `- break-even: never — this arm costs ${formatCostUsd(
                  -savingPerRunUsd
                )} more per conversation, before its ${formatCostUsd(setupDeltaUsd)} of indexing`
              : `- break-even: never — this arm saves ${formatCostUsd(
                  savingPerRunUsd
                )} per conversation, so its ${formatCostUsd(
                  setupDeltaUsd
                )} of indexing is never repaid`
            : `- break-even: ${queries} conversation(s) — ${formatCostUsd(
                setupDeltaUsd
              )} of indexing, repaid at ${formatCostUsd(savingPerRunUsd)} saved per conversation`
        )
      }
      lines.push('')
    }

    const failures = scenarioAggregates.flatMap((entry) =>
      entry.errors.map((message) => `- ${entry.armName}: ${message}`)
    )
    if (failures.length > 0) {
      lines.push('### Errors', '', ...failures, '')
    }
  }

  const anySeparable = runs.length > 0 && aggregates.every((entry) => entry.runs >= 2)
  if (!anySeparable) {
    lines.push(
      '> Every arm was run fewer than twice, so no difference reported here is distinguishable from noise. Raise `--repeat` before drawing a conclusion.',
      ''
    )
  }

  return lines.join('\n')
}

import { computeCostUsd } from './cost'
import type {
  AnswerKey,
  DeterministicVerdict,
  RunResult,
  RunTotals,
  TranscriptEntry,
  TurnMetrics,
} from './types'

/**
 * Turning a finished run into numbers: what the answer key says, what it cost, and the single
 * score arms are ranked on.
 *
 * All of this is pure so it can be unit-tested without an LLM, and so a stored transcript can be
 * re-scored later against a corrected answer key without paying to run the scenario again.
 */

/** Normalizes whitespace and case so an answer key is not defeated by line wrapping. */
const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ')

/**
 * Checks the assistant's own words against the scenario's answer key.
 *
 * Only assistant turns are considered: a required string that appears solely because the
 * simulated user said it first proves nothing about the assistant.
 */
export const checkAnswerKey = (
  transcript: TranscriptEntry[],
  answerKey: AnswerKey | undefined
): DeterministicVerdict => {
  if (!answerKey || (!answerKey.mustMention?.length && !answerKey.mustNotMention?.length)) {
    return { mentioned: [], missing: [], forbidden: [], pass: true, skipped: true }
  }

  const haystack = normalize(
    transcript
      .filter((entry) => entry.role === 'assistant')
      .map((entry) => entry.text)
      .join('\n')
  )

  const mentioned: string[] = []
  const missing: string[] = []
  for (const needle of answerKey.mustMention ?? []) {
    if (haystack.includes(normalize(needle))) mentioned.push(needle)
    else missing.push(needle)
  }

  const forbidden = (answerKey.mustNotMention ?? []).filter((needle) =>
    haystack.includes(normalize(needle))
  )

  return {
    mentioned,
    missing,
    forbidden,
    pass: missing.length === 0 && forbidden.length === 0,
    skipped: false,
  }
}

export const computeTotals = (turns: TurnMetrics[], modelId: string, wallMs: number): RunTotals => {
  const inputTokens = turns.reduce((total, turn) => total + turn.inputTokens, 0)
  const outputTokens = turns.reduce((total, turn) => total + turn.outputTokens, 0)
  const detailKeys = ['noCacheTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
  const hasInputTokenDetails = turns.some((turn) => turn.inputTokenDetails !== undefined)
  const inputTokenDetails = hasInputTokenDetails
    ? Object.fromEntries(
        detailKeys.map((key) => [
          key,
          turns.reduce((total, turn) => total + (turn.inputTokenDetails?.[key] ?? 0), 0),
        ])
      )
    : undefined
  return {
    inputTokens,
    outputTokens,
    totalTokens: turns.reduce((total, turn) => total + turn.totalTokens, 0),
    turns: turns.length,
    toolCalls: turns.reduce((total, turn) => total + turn.toolCalls.length, 0),
    wallMs,
    inputTokenDetails,
    costUsd: computeCostUsd(modelId, inputTokens, outputTokens, inputTokenDetails),
  }
}

/**
 * Collapses a run into one number in [0, 1].
 *
 * The answer key is a hard gate rather than a term in a weighted sum: if the assistant never said
 * the thing it had to say, the run failed, and letting an eloquent wrong answer score 0.7 is
 * exactly how a benchmark stops tracking reality. The judge's score is only consulted for runs
 * that already cleared the gate, and grades how well the goal was served.
 */
export const scoreRun = (run: Pick<RunResult, 'outcome' | 'deterministic' | 'judge'>): number => {
  if (run.outcome === 'error') return 0
  if (!run.deterministic.skipped && !run.deterministic.pass) return 0
  if (run.judge) return Math.max(0, Math.min(1, run.judge.score))
  return run.outcome === 'goal-reached' ? 1 : 0
}

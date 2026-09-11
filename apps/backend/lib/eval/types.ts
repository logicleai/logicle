import type * as dto from '@/types/dto'
import type { ToolImplementation } from '@/lib/chat/tools'

/**
 * Types for the goal-driven evaluation harness.
 *
 * The shape of an evaluation is: a simulated user, driven by an LLM and given a goal, talks to a
 * real Logicle assistant until it decides the goal is reached, gives up, or runs out of turns.
 * The same scenario is replayed against several *arms* — alternative configurations of the
 * assistant — and the arms are compared on whether they got there and what it cost.
 *
 * The point is the comparison, not the absolute score. An arm is only interesting relative to
 * another arm on the same scenario with the same simulated user.
 */

/** A document the assistant is expected to work from. Text is inlined so scenarios are portable. */
export interface CorpusDocument {
  name: string
  mimeType: string
  text: string
}

/**
 * Deterministic checks against the assistant's final answer. These run before the LLM judge and
 * cost nothing; when they disagree with the judge that is a signal the scenario is underspecified,
 * so both are always reported.
 */
export interface AnswerKey {
  /** Case-insensitive substrings that a correct answer must contain. */
  mustMention?: string[]
  /** Case-insensitive substrings that a correct answer must not contain (classic distractors). */
  mustNotMention?: string[]
}

/**
 * The two halves of a flip test: one corpus that contains the answer and one identical except that
 * the answer has been removed. Running the same question against both is what separates a system
 * that *covered* the corpus from one that merely retrieved from it — a system that answers the same
 * way on both has told us nothing, however confident it sounds.
 */
export interface FlipTest {
  /** Shared by the two halves, and the key the paired verdict is computed on. */
  pairId: string
  /** Whether this half's corpus contains the answer. */
  corpus: 'positive' | 'negative'
  /** The value a correct answer states on the positive corpus. */
  needleValue: string
  /** Values stated by distractor documents; quoting one is wrong on either corpus. */
  distractorValues: string[]
}

/** A saved message in a single-turn reference conversation. */
export type ReferenceChatMessage =
  | {
      role: 'user'
      text: string
      /** Corpus document names attached to this historical user message. */
      attachments?: string[]
    }
  | {
      role: 'assistant'
      text?: string
      /** Optional historical tool call. Its result is stored in the following tool message. */
      toolCall?: {
        id: string
        name: string
        args: Record<string, unknown>
      }
    }
  | {
      role: 'tool'
      toolCallId: string
      toolName: string
      result: string
    }

/**
 * A fixed conversation prefix followed by one fixed user question.
 *
 * This mode removes the simulated user's stochastic trajectory from policy comparisons. The
 * saved history is input context only: it is deliberately excluded from the scored transcript,
 * otherwise an answer planted in history could satisfy the deterministic gate by itself.
 */
export interface ReferenceChat {
  history: ReferenceChatMessage[]
  finalUserMessage: string
  /**
   * Deterministic precondition for context-compression arms.
   *
   * Quality fixtures normally require compression to trigger. Boundary fixtures deliberately
   * require the opposite, so a global threshold change cannot silently turn a no-op case into a
   * compression treatment (or make a treatment stop exercising compression).
   */
  compressionExpectation?: {
    triggered: boolean
    applied?: boolean
    /** Optional bounds for fixtures that exercise compressible vs incompressible histories. */
    minSummarizedMessages?: number
    maxSummarizedMessages?: number
    minEstimatedHistoryTokenReduction?: number
    maxEstimatedHistoryTokenReduction?: number
  }
  /** Provenance of the shape, never production content or identifiers. */
  sourceShape?: {
    cohort: string
    messageCount: number
    approximateInputTokens?: number
  }
}

export interface Scenario {
  id: string
  description: string
  /** Documents the assistant can reach, however the arm chooses to expose them. */
  corpus: CorpusDocument[]
  /** What the simulated user is trying to achieve. Never reveals the answer. */
  goal: string
  /** How the simulated user behaves — terse, rambling, distrustful, changes their mind. */
  persona?: string
  /** Hard stop, so a failing arm cannot burn the budget. */
  maxTurns: number
  /** Fixed-history, single-message mode for context-policy evaluations. */
  referenceChat?: ReferenceChat
  /** Added to the assistant prompt for every arm in this scenario. */
  systemPromptSuffix?: string
  /** What a good outcome looks like, handed to the judge together with the transcript. */
  rubric: string
  answerKey?: AnswerKey
  /** Set on both halves of a flip-test pair; drives the paired abstention verdict. */
  flip?: FlipTest
}

/**
 * A configuration of the assistant under test. Arms are the extension point of this harness:
 * knowledge box versus everything-in-context is the first pair, but context compression on/off,
 * router versus no router, or two different chunkings are all expressible the same way.
 */
export interface Arm {
  name: string
  description: string
  /**
   * Prepares whatever the arm needs (ingesting a corpus, creating a tool row) and returns what
   * `ChatAssistant.build` should be given. `teardown` runs even when the run fails.
   */
  setup: (context: ArmSetupContext) => Promise<ArmSetup>
}

export interface ArmSetupContext {
  scenario: Scenario
  /** Files already persisted in the throwaway database and storage, one per corpus document. */
  files: dto.AssistantFile[]
  /** Stable id derived from scenario + arm + repetition, for rows the arm needs to create. */
  runId: string
}

/**
 * What an arm spent before the conversation started — building an index, answering ingestion
 * questions. Paid once per corpus and amortized over every query the index then serves, which is
 * why the report shows it separately and derives a break-even point from it rather than folding
 * it into the per-run total.
 */
export interface SetupCost {
  inputTokens: number
  outputTokens: number
  /** Number of LLM calls made during setup. */
  calls: number
  wallMs: number
  /** Model that incurred this cost. Omitted when setup used no model or it is unknown. */
  modelId?: string
}

export interface ArmSetup {
  tools: ToolImplementation[]
  /** Files handed to the assistant as preamble knowledge — the "everything in context" lever. */
  knowledge: dto.AssistantFile[]
  /**
   * Assistant settings this arm changes. This keeps configuration comparisons in the harness,
   * rather than requiring an arm to fork the production ChatAssistant construction path.
   */
  assistant?: {
    contextCompression: dto.ContextCompressionConfig
  }
  /** Appended to the scenario's system prompt, for arm-specific instructions. */
  systemPromptSuffix?: string
  /** Omitted by arms that need no preparation, such as the all-in-context baseline. */
  setupCost?: SetupCost
  teardown?: () => Promise<void>
}

export type TranscriptRole = 'user' | 'assistant'

export interface TranscriptEntry {
  role: TranscriptRole
  text: string
  /** Tool functions the assistant called on this turn. Empty for user entries. */
  toolCalls?: string[]
}

/** Token accounting for one assistant turn, taken from the stream's own `usage` parts. */
export interface TurnUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** Provider-reported prompt-cache accounting, when available. */
  inputTokenDetails?: {
    noCacheTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
}

export interface TurnMetrics extends TurnUsage {
  toolCalls: string[]
  latencyMs: number
}

export interface CompressionDiagnostics {
  enabled: boolean
  estimatedHistoryTokensBefore: number
  estimatedHistoryTokensAfter: number
  triggerAtTokens?: number
  triggered: boolean
  /** True only when at least one cost-effective summary was actually sent to the provider. */
  applied?: boolean
  summarizedMessages: number
  rejectedMessages?: number
  minimumMessageSavingsTokens?: number
  minimumPlanSavingsTokens?: number
  keepRecentTurns?: number
}

export type RunOutcome = 'goal-reached' | 'max-turns' | 'gave-up' | 'error'

export interface DeterministicVerdict {
  /** Required substrings that were found. */
  mentioned: string[]
  /** Required substrings that were absent — the reason a run fails this check. */
  missing: string[]
  /** Forbidden substrings that appeared anyway. */
  forbidden: string[]
  pass: boolean
  /** True when the scenario declared no answer key, so `pass` carries no information. */
  skipped: boolean
}

/**
 * A conservative lexical classification of rate values in the assistant output.
 *
 * The distinction that matters for the thesis is between *declining* and *never getting there*:
 * an assistant that says "this is not in the documents" has made a claim about coverage, and one
 * that is still searching when the turn budget runs out has not.
 */
export type AssertionClass =
  /** Mentioned only the value that the needle document carries. */
  | 'asserted-needle'
  /** Mentioned another or unexpected percentage; unsafe even when the needle was also present. */
  | 'asserted-other'
  /** The user accepted the conversation without the assistant mentioning a percentage. */
  | 'abstained'
  /** The user gave up or the turn budget ran out before a clean conclusion. */
  | 'exhausted'
  | 'error'

export interface FlipRunVerdict {
  pairId: string
  corpus: 'positive' | 'negative'
  assertion: AssertionClass
}

export interface JudgeVerdict {
  /** 0 = goal not achieved at all, 1 = fully achieved. */
  score: number
  reasoning: string
}

export interface RunTotals extends TurnUsage {
  turns: number
  toolCalls: number
  wallMs: number
  /** USD, when the model's price is known. Undefined means "report tokens only". */
  costUsd?: number
}

export interface RunResult {
  scenarioId: string
  armName: string
  repetition: number
  outcome: RunOutcome
  /** Present when `outcome` is 'error'. */
  error?: string
  transcript: TranscriptEntry[]
  turns: TurnMetrics[]
  totals: RunTotals
  deterministic: DeterministicVerdict
  judge?: JudgeVerdict
  /** What this arm spent preparing, before the first user message. */
  setupCost?: SetupCost
  /** USD equivalent of `setupCost`, when the ingestion model's price is known. */
  setupCostUsd?: number
  /** Exact tokenizer-based planner precondition and estimated history reduction. */
  compression?: CompressionDiagnostics
  /** Present when the scenario declared `flip`; paired with its opposite half at report time. */
  flip?: FlipRunVerdict
  /**
   * The single number arms are ranked on: deterministic pass and judge score combined. See
   * `scoreRun` in metrics.ts for how the two are reconciled.
   */
  score: number
}

/** Versioned, portable record emitted by the runner with --runs-out. */
export interface EvaluationArtifact {
  version: 1
  createdAt: string
  metadata: {
    gitRevision?: string
    gitDirty?: boolean
    provider: string
    assistantModel: string
    userModel: string
    judgeModel?: string
    baselineArm: string
    arms: string[]
    scenarios: string[]
    repeat: number
    suite?: string
    sweep?: {
      documents: number[]
      wordsPerDocument: number
      distractors: number
      needleDepth: number
      seed: number
      /** Set when --flip generated paired corpora; how the answer was removed from the negative half. */
      flipWithhold?: 'clause' | 'document'
    }
  }
  runs: RunResult[]
}

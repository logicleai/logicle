import { nanoid } from 'nanoid'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type * as dto from '@/types/dto'
import { applyStreamPartToMessages } from '@/lib/chat/streamApply'
import { ChatAssistant, type AssistantParams } from '@/backend/lib/chat'
import {
  planMessageCompression,
  resolveCompressionRetrievalMode,
  resolveCompressionTriggerTokens,
} from '@/backend/lib/chat/compression-planner'
import {
  buildCostEffectiveCompressionPlan,
  MIN_COMPRESSION_MESSAGE_SAVINGS_TOKENS,
  MIN_COMPRESSION_PLAN_SAVINGS_TOKENS,
} from '@/backend/lib/chat/compression-economics'
import { estimateHistoryMessageCosts } from '@/backend/lib/chat/token-estimator'
import type { LlmModel } from '@/lib/chat/models'
import type { ProviderConfig } from '@/types/provider'
import { classifyRun } from './abstention'
import { computeCostUsd } from './cost'
import { materializeCorpus } from './corpus'
import { checkAnswerKey, computeTotals, scoreRun } from './metrics'
import { materializeReferenceChat } from './referenceChat'
import { EvalSink } from './sink'
import { createSimulatedUser } from './simulatedUser'
import type { Judge } from './judge'
import type { Arm, RunOutcome, RunResult, Scenario, TranscriptEntry, TurnMetrics } from './types'

/**
 * Runs one (scenario, arm) pair to completion.
 *
 * The assistant under test is the real `ChatAssistant`, driven in-process against a throwaway
 * database: real preamble construction, real tool loop, real token accounting. The only thing
 * standing in for a human is the simulated user, and the only thing standing in for a reviewer is
 * the judge — everything between them is the code that would run in production.
 */

export interface RunOptions {
  scenario: Scenario
  arm: Arm
  repetition: number
  /** Provider + model the assistant under test runs on. This is what the report prices. */
  assistant: {
    providerConfig: ProviderConfig
    model: string
    llmModel: LlmModel
    systemPrompt: string
    tokenLimit: number
  }
  /** Model impersonating the user. Kept separate so it can be cheaper than the assistant. */
  userModel: LanguageModelV3
  judge?: Judge
  /** Called with progress lines so a long run is not silent. */
  onProgress?: (line: string) => void
}

const userMessage = (
  conversationId: string,
  parent: string | null,
  content: string
): dto.UserMessage => ({
  id: nanoid(),
  conversationId,
  parent,
  sentAt: new Date().toISOString(),
  role: 'user',
  content,
  attachments: [],
})

/** Flattens whatever the assistant produced this turn into plain text for the transcript. */
const assistantText = (sink: EvalSink): string => {
  const text = sink.getText().trim()
  if (text.length > 0) return text
  const errors = sink.getErrors()
  return errors.length > 0 ? `[error] ${errors.join('; ')}` : '[no reply]'
}

export const runOne = async (options: RunOptions): Promise<RunResult> => {
  const { scenario, arm, repetition, assistant, userModel, judge, onProgress } = options
  const runId = `${scenario.id}-${arm.name}-${repetition}`.replace(/[^a-zA-Z0-9-]/g, '')
  const startedAt = Date.now()

  const transcript: TranscriptEntry[] = []
  const turns: TurnMetrics[] = []
  let outcome: RunOutcome = 'max-turns'
  let error: string | undefined

  const corpus = await materializeCorpus(scenario.corpus, runId)
  let teardown: (() => Promise<void>) | undefined
  let setupCost: RunResult['setupCost']
  let compressionDiagnostics: RunResult['compression']

  try {
    const setup = await arm.setup({ scenario, files: corpus.files, runId })
    teardown = setup.teardown
    setupCost = setup.setupCost

    const promptSuffix = [scenario.systemPromptSuffix, setup.systemPromptSuffix]
      .filter(Boolean)
      .join('\n\n')
    const assistantParams: AssistantParams = {
      assistantId: `eval-assistant-${runId}`,
      model: assistant.model,
      systemPrompt: promptSuffix
        ? `${assistant.systemPrompt}\n\n${promptSuffix}`
        : assistant.systemPrompt,
      temperature: 0,
      tokenLimit: assistant.tokenLimit,
      reasoning_effort: null,
      contextCompression: setup.assistant?.contextCompression ?? null,
    }

    const conversationId = `eval-conv-${runId}`
    let messages: dto.Message[] = scenario.referenceChat
      ? materializeReferenceChat(scenario.referenceChat, {
          conversationId,
          runId,
          files: corpus.files,
          corpus: scenario.corpus,
        })
      : []

    const chatAssistant = await ChatAssistant.build(
      assistant.providerConfig,
      assistantParams,
      {},
      setup.tools,
      setup.knowledge,
      { user: 'eval-user', conversationId }
    )

    const simulatedUser = scenario.referenceChat
      ? undefined
      : createSimulatedUser(userModel, scenario)

    const turnLimit = scenario.referenceChat ? 1 : scenario.maxTurns
    for (let turn = 0; turn < turnLimit; turn++) {
      const decision = scenario.referenceChat
        ? { action: 'message' as const, message: scenario.referenceChat.finalUserMessage }
        : await simulatedUser!.next(transcript)
      if (decision.action === 'done') {
        outcome = 'goal-reached'
        break
      }
      if (decision.action === 'give-up') {
        outcome = 'gave-up'
        onProgress?.(`  user gave up: ${decision.reason ?? 'no reason given'}`)
        break
      }

      const content = decision.message!
      transcript.push({ role: 'user', text: content })
      onProgress?.(`  user> ${content.slice(0, 120)}`)

      const parent = messages.at(-1)?.id ?? null
      const message = userMessage(conversationId, parent, content)
      messages = [...messages, message]

      if (scenario.referenceChat) {
        const costsBefore = await estimateHistoryMessageCosts(assistant.llmModel, messages)
        const estimatedHistoryTokensBefore = costsBefore.reduce(
          (total, cost) => total + cost.tokens,
          0
        )
        const compression = assistantParams.contextCompression
        if (!compression) {
          compressionDiagnostics = {
            enabled: false,
            estimatedHistoryTokensBefore,
            estimatedHistoryTokensAfter: estimatedHistoryTokensBefore,
            triggered: false,
            applied: false,
            summarizedMessages: 0,
            rejectedMessages: 0,
          }
        } else {
          const triggerAtTokens = resolveCompressionTriggerTokens(compression.triggerAtTokens)
          const triggered = estimatedHistoryTokensBefore >= triggerAtTokens
          let decisions = triggered
            ? planMessageCompression(messages, compression.preset, {
                keepRecentTurns: compression.keepRecentTurns,
              })
            : []
          const plan = triggered
            ? await buildCostEffectiveCompressionPlan({
                messages,
                decisions,
                model: assistant.llmModel,
                historyCostsBefore: costsBefore,
                application: {
                  prefetchQuery:
                    resolveCompressionRetrievalMode(compression.retrievalMode) === 'prefetch'
                      ? message.content
                      : undefined,
                },
              })
            : undefined
          if (plan) decisions = plan.decisions
          compressionDiagnostics = {
            enabled: true,
            estimatedHistoryTokensBefore,
            estimatedHistoryTokensAfter: plan
              ? plan.historyCostsAfter.reduce((total, cost) => total + cost.tokens, 0)
              : estimatedHistoryTokensBefore,
            triggerAtTokens,
            triggered,
            applied: plan?.applied ?? false,
            summarizedMessages: decisions.filter((decision) => decision.policy === 'summary')
              .length,
            rejectedMessages: decisions.filter((decision) =>
              decision.reason.startsWith('summary rejected:')
            ).length,
            minimumMessageSavingsTokens: MIN_COMPRESSION_MESSAGE_SAVINGS_TOKENS,
            minimumPlanSavingsTokens: MIN_COMPRESSION_PLAN_SAVINGS_TOKENS,
            keepRecentTurns: compression.keepRecentTurns,
          }
          const expectation = scenario.referenceChat.compressionExpectation
          if (expectation) {
            const reduction =
              compressionDiagnostics.estimatedHistoryTokensBefore -
              compressionDiagnostics.estimatedHistoryTokensAfter
            const failures = [
              expectation.triggered !== triggered
                ? `expected triggered=${expectation.triggered}, got ${triggered}`
                : undefined,
              expectation.applied !== undefined &&
              expectation.applied !== compressionDiagnostics.applied
                ? `expected applied=${expectation.applied}, got ${compressionDiagnostics.applied}`
                : undefined,
              expectation.minSummarizedMessages !== undefined &&
              compressionDiagnostics.summarizedMessages < expectation.minSummarizedMessages
                ? `expected at least ${expectation.minSummarizedMessages} summarized message(s), got ${compressionDiagnostics.summarizedMessages}`
                : undefined,
              expectation.maxSummarizedMessages !== undefined &&
              compressionDiagnostics.summarizedMessages > expectation.maxSummarizedMessages
                ? `expected at most ${expectation.maxSummarizedMessages} summarized message(s), got ${compressionDiagnostics.summarizedMessages}`
                : undefined,
              expectation.minEstimatedHistoryTokenReduction !== undefined &&
              reduction < expectation.minEstimatedHistoryTokenReduction
                ? `expected at least ${expectation.minEstimatedHistoryTokenReduction} estimated history tokens saved, got ${reduction}`
                : undefined,
              expectation.maxEstimatedHistoryTokenReduction !== undefined &&
              reduction > expectation.maxEstimatedHistoryTokenReduction
                ? `expected at most ${expectation.maxEstimatedHistoryTokenReduction} estimated history tokens saved, got ${reduction}`
                : undefined,
            ].filter((failure): failure is string => failure !== undefined)
            if (failures.length > 0) {
              throw new Error(`Compression fixture precondition failed: ${failures.join('; ')}`)
            }
          }
        }
      }

      const sink = new EvalSink()
      const turnStartedAt = Date.now()
      await chatAssistant.processUserMessageWithSink(messages, sink)
      const latencyMs = Date.now() - turnStartedAt

      // Rebuild history exactly the way ChatState and the frontend do, so the next turn sees the
      // assistant's tool calls and results rather than a flattened summary of them.
      for (const event of sink.events) {
        messages = applyStreamPartToMessages(messages, event)
      }

      const toolCalls = sink.getToolCallNames()
      turns.push({ ...sink.getUsage(), toolCalls, latencyMs })
      const reply = assistantText(sink)
      transcript.push({ role: 'assistant', text: reply, toolCalls })
      onProgress?.(
        `  assistant> ${reply.slice(0, 120)}${
          toolCalls.length > 0 ? ` [${toolCalls.join(', ')}]` : ''
        }`
      )

      if (scenario.referenceChat) {
        outcome = 'goal-reached'
        break
      }
    }
  } catch (caught) {
    outcome = 'error'
    error = caught instanceof Error ? caught.message : String(caught)
    onProgress?.(`  error: ${error}`)
  } finally {
    await teardown?.().catch(() => undefined)
    await corpus.cleanup().catch(() => undefined)
  }

  const deterministic = checkAnswerKey(transcript, scenario.answerKey)
  const judgeVerdict =
    judge && outcome !== 'error' && transcript.length > 0
      ? await judge.grade(scenario, transcript).catch(() => undefined)
      : undefined

  const result: RunResult = {
    scenarioId: scenario.id,
    armName: arm.name,
    repetition,
    outcome,
    error,
    transcript,
    turns,
    totals: computeTotals(turns, assistant.model, Date.now() - startedAt),
    deterministic,
    judge: judgeVerdict,
    setupCost,
    setupCostUsd: setupCost
      ? setupCost.calls === 0
        ? 0
        : setupCost.modelId
        ? computeCostUsd(setupCost.modelId, setupCost.inputTokens, setupCost.outputTokens)
        : undefined
      : undefined,
    compression: compressionDiagnostics,
    flip: scenario.flip ? classifyRun(transcript, outcome, scenario.flip) : undefined,
    score: 0,
  }
  result.score = scoreRun(result)
  return result
}

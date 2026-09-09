import { nanoid } from 'nanoid'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type * as dto from '@/types/dto'
import { applyStreamPartToMessages } from '@/lib/chat/streamApply'
import { ChatAssistant, type AssistantParams } from '@/backend/lib/chat'
import type { ProviderConfig } from '@/types/provider'
import { computeCostUsd } from './cost'
import { materializeCorpus } from './corpus'
import { checkAnswerKey, computeTotals, scoreRun } from './metrics'
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

  try {
    const setup = await arm.setup({ scenario, files: corpus.files, runId })
    teardown = setup.teardown
    setupCost = setup.setupCost

    const assistantParams: AssistantParams = {
      assistantId: `eval-assistant-${runId}`,
      model: assistant.model,
      systemPrompt: setup.systemPromptSuffix
        ? `${assistant.systemPrompt}\n\n${setup.systemPromptSuffix}`
        : assistant.systemPrompt,
      temperature: 0,
      tokenLimit: assistant.tokenLimit,
      reasoning_effort: null,
      contextCompression: setup.assistant?.contextCompression ?? null,
    }

    const conversationId = `eval-conv-${runId}`
    let messages: dto.Message[] = []

    const chatAssistant = await ChatAssistant.build(
      assistant.providerConfig,
      assistantParams,
      {},
      setup.tools,
      setup.knowledge,
      { user: 'eval-user', conversationId }
    )

    const simulatedUser = createSimulatedUser(userModel, scenario)

    for (let turn = 0; turn < scenario.maxTurns; turn++) {
      const decision = await simulatedUser.next(transcript)
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
    score: 0,
  }
  result.score = scoreRun(result)
  return result
}

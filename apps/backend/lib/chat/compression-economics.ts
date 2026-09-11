import type * as dto from '@/types/dto'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunctions, ToolImplementation } from '@/lib/chat/tools'
import { applyCompressionPlan, type CompressionApplicationOptions } from './compression-planner'
import { estimateHistoryMessageCosts, type HistoryMessageCost } from './token-estimator'

/**
 * A compressed message needs some margin over its replacement summary, and the whole plan needs
 * enough margin to pay for the context-retrieve prompt fragment and function schemas. The plan
 * threshold is anchored to the 325-token gpt-4o-mini overhead measured by the synthetic boundary
 * fixtures on 2026-09-11, with room for tokenizer/provider variation.
 */
export const MIN_COMPRESSION_MESSAGE_SAVINGS_TOKENS = 64
export const MIN_COMPRESSION_PLAN_SAVINGS_TOKENS = 384

export interface CostEffectiveCompressionPlan {
  messages: dto.Message[]
  decisions: dto.MessageCompressionDecision[]
  historyCostsAfter: HistoryMessageCost[]
  estimatedHistoryTokenReduction: number
  applied: boolean
}

export const selectCompressionPromptCapabilities = (options: {
  tools: ToolImplementation[]
  functions: ToolFunctions
  functionToolIdMap: Map<string, string>
  compressionConfigured: boolean
  compressionApplied: boolean
}): { tools: ToolImplementation[]; functions: ToolFunctions } => {
  if (!options.compressionConfigured || options.compressionApplied) {
    return { tools: options.tools, functions: options.functions }
  }
  return {
    tools: options.tools.filter((tool) => tool.toolParams.id !== 'context-retrieve'),
    functions: Object.fromEntries(
      Object.entries(options.functions).filter(
        ([name]) => options.functionToolIdMap.get(name) !== 'context-retrieve'
      )
    ),
  }
}

const totalTokens = (costs: HistoryMessageCost[]): number =>
  costs.reduce((total, cost) => total + cost.tokens, 0)

const keepOnlyBeneficialSummaries = (
  decisions: dto.MessageCompressionDecision[],
  before: HistoryMessageCost[],
  after: HistoryMessageCost[]
): dto.MessageCompressionDecision[] => {
  const beforeById = new Map(before.map((cost) => [cost.messageId, cost]))
  const afterById = new Map(after.map((cost) => [cost.messageId, cost.tokens]))

  return decisions.map((decision) => {
    if (decision.policy !== 'summary') return decision
    const beforeCost = beforeById.get(decision.messageId)
    // A summarized tool result can also redact a large payload from its sibling assistant tool
    // call. That saving lands on a different message, so a per-message comparison would reject
    // the decision even when the complete plan is strongly beneficial. Let the aggregate guard
    // decide tool-result economics.
    if (beforeCost?.role === 'tool') return decision
    const saving = (beforeCost?.tokens ?? 0) - (afterById.get(decision.messageId) ?? 0)
    return saving >= MIN_COMPRESSION_MESSAGE_SAVINGS_TOKENS
      ? decision
      : {
          ...decision,
          policy: 'full',
          reason: `summary rejected: estimated saving ${saving} tokens is below ${MIN_COMPRESSION_MESSAGE_SAVINGS_TOKENS}`,
        }
  })
}

/**
 * Materializes candidate summaries, then keeps them only when both the individual replacement and
 * the complete plan have a positive economic margin. Rejected summaries may remain warm in the
 * cache, but are not sent to the provider and do not activate the retrieval tool for this call.
 */
export const buildCostEffectiveCompressionPlan = async (options: {
  messages: dto.Message[]
  decisions: dto.MessageCompressionDecision[]
  model: LlmModel
  historyCostsBefore: HistoryMessageCost[]
  application: CompressionApplicationOptions
}): Promise<CostEffectiveCompressionPlan> => {
  const beforeTokens = totalTokens(options.historyCostsBefore)
  const noPlanResult = async (
    decisions: dto.MessageCompressionDecision[]
  ): Promise<CostEffectiveCompressionPlan> => {
    // The attachment-only continuation note is behaviorally useful even when no historical
    // summary survives the economic guards. It does not need context-retrieve, so preserve that
    // annotation while still reporting `applied: false`.
    const messages = options.application.attachmentContinuationQuery?.trim()
      ? await applyCompressionPlan(options.messages, decisions, {
          attachmentContinuationQuery: options.application.attachmentContinuationQuery,
        })
      : options.messages
    const historyCostsAfter =
      messages === options.messages
        ? options.historyCostsBefore
        : await estimateHistoryMessageCosts(options.model, messages)
    return {
      messages,
      decisions,
      historyCostsAfter,
      estimatedHistoryTokenReduction: beforeTokens - totalTokens(historyCostsAfter),
      applied: false,
    }
  }
  const candidateMessages = await applyCompressionPlan(
    options.messages,
    options.decisions,
    options.application
  )
  const candidateCosts = await estimateHistoryMessageCosts(options.model, candidateMessages)
  const decisions = keepOnlyBeneficialSummaries(
    options.decisions,
    options.historyCostsBefore,
    candidateCosts
  )
  const summarizedMessages = decisions.filter((decision) => decision.policy === 'summary').length
  if (summarizedMessages === 0) {
    return noPlanResult(decisions)
  }

  const rejectedAny = decisions.some(
    (decision, index) =>
      decision.policy !== options.decisions[index]?.policy ||
      decision.reason !== options.decisions[index]?.reason
  )
  const messages = rejectedAny
    ? await applyCompressionPlan(options.messages, decisions, options.application)
    : candidateMessages
  const historyCostsAfter = rejectedAny
    ? await estimateHistoryMessageCosts(options.model, messages)
    : candidateCosts
  const estimatedHistoryTokenReduction = beforeTokens - totalTokens(historyCostsAfter)

  if (estimatedHistoryTokenReduction < MIN_COMPRESSION_PLAN_SAVINGS_TOKENS) {
    return noPlanResult(
      decisions.map((decision) =>
        decision.policy === 'summary'
          ? {
              ...decision,
              policy: 'full',
              reason: `summary rejected: plan saves ${estimatedHistoryTokenReduction} tokens, below ${MIN_COMPRESSION_PLAN_SAVINGS_TOKENS}`,
            }
          : decision
      )
    )
  }

  return {
    messages,
    decisions,
    historyCostsAfter,
    estimatedHistoryTokenReduction,
    applied: true,
  }
}

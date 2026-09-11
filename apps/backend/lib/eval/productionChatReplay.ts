import * as ai from 'ai'
import * as z from 'zod'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type * as dto from '@/types/dto'
import type { ProviderType } from '@/types/provider'
import type { KnowledgeBoxQuestion } from '@/lib/tools/schemas'
import type { TurnUsage } from './types'

const inputTokenDetailsSchema = z.object({
  noCacheTokens: z.number().nonnegative().optional(),
  cacheReadTokens: z.number().nonnegative().optional(),
  cacheWriteTokens: z.number().nonnegative().optional(),
})

/** Safely reads provider cache accounting persisted in `MessageAudit.tokenDetails`. */
export const parseAuditInputTokenDetails = (
  raw: string | null
): TurnUsage['inputTokenDetails'] | undefined => {
  if (!raw) return undefined
  try {
    const parsed = inputTokenDetailsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/**
 * One production turn selected for offline replay.
 *
 * The runner reconstructs this shape from a complete conversation, loaded either from the live
 * database or from a bundle produced by `eval-build-replay-bundle.ts`. Bundled conversation and
 * assistant-knowledge file bytes live in `ReplayFileBlob`, already decrypted.
 */
export interface ProductionReplayCase {
  id: string
  source: {
    conversationId: string
    messageId: string
    /** Production's own `MessageAudit` input-token count for this turn. */
    auditedInputTokens: number
    /** Provider cache accounting saved with the production audit, when available and valid. */
    auditedInputTokenDetails?: TurnUsage['inputTokenDetails']
    auditedModel: string
    sentAt: string
  }
  assistant: {
    id: string
    versionId: string
    providerType: ProviderType
    model: string
    systemPrompt: string
    temperature: number
    tokenLimit: number
    reasoningEffort: dto.AssistantVersion['reasoning_effort']
    /** Parsed `AssistantVersion.contextCompression`; shape follows the running code's schema. */
    contextCompression: Record<string, unknown> | null
    /** `Backend.configuration.endPoint`, when the backend needs one (e.g. `logiclecloud`). */
    backendEndpoint?: string
  }
  /** The complete saved lineage, ending in the user message that incurred the audited prompt. */
  messages: dto.Message[]
  /** Knowledge files attached to the published assistant version, in configured order. */
  knowledgeFiles: dto.AssistantFile[]
  /** Production's next assistant text. It is a reference for the judge, not an answer key. */
  productionReply: string
}

/**
 * The saved MessageAudit baseline is comparable only when replay uses the exact same model id.
 * Model overrides (for example a cheaper Luna replay of a Terra production turn) must be
 * compared as replay arms instead of being presented as a production token/cost delta.
 */
export const isSameProductionModel = (
  source: Pick<ProductionReplayCase['source'], 'auditedModel'>,
  replayModelId: string
): boolean => replayModelId === source.auditedModel

export const knowledgeReplayArmNames = [
  'assistant-knowledge',
  'knowledge-box',
  'knowledge-box-no-projections',
] as const

export type KnowledgeReplayArmName = (typeof knowledgeReplayArmNames)[number]

/**
 * General-purpose projections for replaying an existing assistant knowledge corpus as a box.
 * Real deployments should still tune questions to their corpus; the chunks-only arm shows how
 * much these generic projections help or hurt.
 */
export const defaultReplayKnowledgeQuestions: KnowledgeBoxQuestion[] = [
  {
    id: 'summary',
    title: 'Summary',
    prompt:
      'What is this document, who or what does it concern, and what does it govern or explain?',
  },
  {
    id: 'key-facts',
    title: 'Key facts',
    prompt:
      'List the concrete names, identifiers, figures, dates, deadlines, requirements, and decisions stated by this document, each with what it refers to.',
  },
]

export const parseKnowledgeReplayArms = (
  raw: string | undefined,
  hasKnowledgeFiles: boolean
): KnowledgeReplayArmName[] => {
  if (!raw) return ['assistant-knowledge']

  const names = raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  if (names.length === 0) throw new Error('--knowledge-arms must name at least one arm')

  const known = new Set<string>(knowledgeReplayArmNames)
  const unknown = names.filter((name) => !known.has(name))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown knowledge arm(s): ${unknown.join(', ')}. Known: ${knowledgeReplayArmNames.join(
        ', '
      )}`
    )
  }
  if (!hasKnowledgeFiles && names.some((name) => name !== 'assistant-knowledge')) {
    throw new Error(
      'Knowledge-box replay requires at least one configured assistant knowledge file'
    )
  }

  return [...new Set(names)] as KnowledgeReplayArmName[]
}

export type ReplayVerdict = 'equivalent' | 'minor-regression' | 'major-regression' | 'inconclusive'

export interface ReplayJudgment {
  verdict: ReplayVerdict
  rationale: string
  failures: string[]
}

const replayJudgmentSchema = z.object({
  verdict: z.enum(['equivalent', 'minor-regression', 'major-regression', 'inconclusive']),
  rationale: z.string(),
  failures: z.array(z.string()),
})

const replayJudgePrompt = [
  'Compare a candidate chat response with the production response to the same final user message.',
  'Decide whether the candidate configuration caused a material regression in helpfulness, completeness, instruction-following, or unsupported claims.',
  'The production answer is only a reference, not proof that its facts are correct. Do not invent a factual answer key.',
  'Return equivalent when the candidate is at least as useful in substance; minor-regression for a recoverable omission; major-regression when the user would materially fail; inconclusive when the reference is insufficient to judge.',
  'Do not prefer either answer for length, style, or wording alone.',
].join('\n')

export const createReplayJudge =
  (model: LanguageModelV3, options: { supportsTemperature?: boolean } = {}) =>
  async (
    finalUserMessage: string,
    productionReply: string,
    candidateReply: string
  ): Promise<ReplayJudgment> => {
    const result = await ai.generateObject({
      model,
      schema: replayJudgmentSchema,
      // Reasoning models (o-series, gpt-5*) reject an explicit temperature.
      ...(options.supportsTemperature === false ? {} : { temperature: 0 }),
      system: replayJudgePrompt,
      prompt: [
        `Final user message:\n${finalUserMessage}`,
        '',
        `Production response:\n${productionReply || '[no saved assistant response]'}`,
        '',
        `Candidate response:\n${candidateReply || '[no candidate response]'}`,
      ].join('\n'),
    })
    return {
      verdict: result.object.verdict,
      rationale: result.object.rationale.trim(),
      failures: result.object.failures.map((failure) => failure.trim()).filter(Boolean),
    }
  }

export const messageHasAttachment = (message: dto.Message): boolean =>
  (message.role === 'user' || message.role === 'user-response') &&
  'attachments' in message &&
  message.attachments.length > 0

/** Every distinct attachment file id referenced anywhere in a lineage, in first-seen order. */
export const collectAttachmentFileIds = (messages: dto.Message[]): string[] => {
  const ids = new Set<string>()
  for (const message of messages) {
    if ((message.role === 'user' || message.role === 'user-response') && 'attachments' in message) {
      for (const attachment of message.attachments) ids.add(attachment.id)
    }
  }
  return [...ids]
}

export const isReplayableLineage = (messages: dto.Message[]): string | undefined => {
  // Attachments are fine: the bundle carries their bytes. Tool, authorization, and error activity
  // are not — replaying them would silently drop a capability.
  if (messages.some((message) => message.role !== 'user' && message.role !== 'assistant')) {
    return 'history contains tool, authorization, or error activity'
  }
  if (messages.length === 0 || messages.at(-1)?.role !== 'user') {
    return 'audited message does not end a user-message lineage'
  }
  return undefined
}

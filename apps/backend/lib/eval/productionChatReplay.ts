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

export interface ReplaySourceEvidence {
  /** A short, human-readable statement of what the reviewed sources establish. */
  claim: string
  /** Bounded excerpts or source-grounded facts; never shown to the simulated user. */
  evidence: string[]
}

export type ReplaySourceVerdict = 'source-correct' | 'source-incorrect' | 'inconclusive'

export interface ReplaySourceJudgment {
  verdict: ReplaySourceVerdict
  rationale: string
  failures: string[]
}

const replaySourceEvidenceSchema = z.object({
  claim: z.string().trim().min(1),
  evidence: z.array(z.string().trim().min(1)).min(1),
})

/** Parses private, reviewed source evidence supplied to the optional source-grounded judge. */
export const parseReplaySourceEvidence = (raw: string): ReplaySourceEvidence =>
  replaySourceEvidenceSchema.parse(JSON.parse(raw))

const replayJudgmentSchema = z.object({
  verdict: z.enum(['equivalent', 'minor-regression', 'major-regression', 'inconclusive']),
  rationale: z.string(),
  failures: z.array(z.string()),
})

const replaySourceJudgmentSchema = z.object({
  verdict: z.enum(['source-correct', 'source-incorrect', 'inconclusive']),
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

const replaySourceJudgePrompt = [
  'Assess a candidate chat response against reviewed source evidence for the same final user question.',
  'The source evidence is the authority for the claims it covers. Do not use the production response as an answer key.',
  'Mark source-correct only when the candidate does not materially contradict the evidence and answers the covered question adequately.',
  'Mark source-incorrect when the candidate makes a material contradiction, reverses a source distinction, or presents an unsupported operational conclusion as established fact.',
  'Mark inconclusive when the evidence does not cover the claim or the candidate is too ambiguous to assess.',
  'Do not penalize wording, length, or harmless omissions outside the reviewed evidence.',
].join('\n')

export const createSourceGroundedReplayJudge =
  (model: LanguageModelV3, options: { supportsTemperature?: boolean } = {}) =>
  async (
    finalUserMessage: string,
    sourceEvidence: ReplaySourceEvidence,
    candidateReply: string
  ): Promise<ReplaySourceJudgment> => {
    const result = await ai.generateObject({
      model,
      schema: replaySourceJudgmentSchema,
      ...(options.supportsTemperature === false ? {} : { temperature: 0 }),
      system: replaySourceJudgePrompt,
      prompt: [
        `Final user message:\n${finalUserMessage}`,
        '',
        `Reviewed source claim:\n${sourceEvidence.claim}`,
        '',
        `Reviewed source evidence:\n${sourceEvidence.evidence
          .map((excerpt, index) => `[${index + 1}] ${excerpt}`)
          .join('\n\n')}`,
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

type ReplayMessageNode = {
  id: string
  parent: string | null
  role: string
}

/**
 * Returns the saved descendants of a user turn, stopping at the next user branch.
 *
 * MessageAudit timestamps are not a reliable turn boundary: a user audit can be persisted after
 * the assistant/tool response. The parent graph is the source of truth for deciding whether the
 * selected production turn used a tool.
 */
export const collectTurnDescendantMessageIds = (
  messages: ReplayMessageNode[],
  rootMessageId: string
): Set<string> => {
  const childrenByParent = new Map<string, ReplayMessageNode[]>()
  for (const message of messages) {
    if (!message.parent) continue
    const children = childrenByParent.get(message.parent) ?? []
    children.push(message)
    childrenByParent.set(message.parent, children)
  }

  const descendants = new Set<string>()
  const pendingParents = [rootMessageId]
  while (pendingParents.length > 0) {
    const parentId = pendingParents.shift()!
    for (const child of childrenByParent.get(parentId) ?? []) {
      if (child.role === 'user' || child.role === 'user-response') continue
      if (descendants.has(child.id)) continue
      descendants.add(child.id)
      pendingParents.push(child.id)
    }
  }
  return descendants
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

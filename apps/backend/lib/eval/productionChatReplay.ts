import * as ai from 'ai'
import * as z from 'zod'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type * as dto from '@/types/dto'
import type { ProviderType } from '@/types/provider'

/**
 * One production turn selected for offline replay.
 *
 * The bundle builder (`eval-build-replay-bundle.ts`) writes the full lineage, the published
 * assistant configuration, and the saved production reply into a self-contained SQLite bundle;
 * attachment bytes travel in the bundle's `ReplayFileBlob` table, already decrypted. The runner
 * reconstructs this shape from the bundle and never touches the source deployment.
 */
export interface ProductionReplayCase {
  id: string
  source: {
    conversationId: string
    messageId: string
    /** Production's own `MessageAudit` input-token count for this turn. */
    auditedInputTokens: number
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
  /** Production's next assistant text. It is a reference for the judge, not an answer key. */
  productionReply: string
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
  'Decide whether compression caused a material regression in helpfulness, completeness, instruction-following, or unsupported claims.',
  'The production answer is only a reference, not proof that its facts are correct. Do not invent a factual answer key.',
  'Return equivalent when the candidate is at least as useful in substance; minor-regression for a recoverable omission; major-regression when the user would materially fail; inconclusive when the reference is insufficient to judge.',
  'Do not prefer either answer for length, style, or wording alone.',
].join('\n')

export const createReplayJudge =
  (model: LanguageModelV3) =>
  async (
    finalUserMessage: string,
    productionReply: string,
    candidateReply: string
  ): Promise<ReplayJudgment> => {
    const result = await ai.generateObject({
      model,
      schema: replayJudgmentSchema,
      temperature: 0,
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

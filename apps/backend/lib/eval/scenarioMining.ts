import * as ai from 'ai'
import * as z from 'zod'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { Scenario, TranscriptEntry } from './types'

/**
 * Turning a real conversation into a scenario draft.
 *
 * Hand-written scenarios drift towards what the author already believes the system is good at.
 * Real conversations do not, which is why this exists: point it at a Logicle database, and it
 * proposes goals, personas and rubrics taken from what people actually asked.
 *
 * The output is a *draft*, deliberately. A scenario needs an answer key that is actually true of
 * the corpus, and only a human who can read the source documents can confirm that. The model
 * proposes candidate facts; it does not get to certify them, and `needsReview` stays true.
 */

const draftSchema = z.object({
  /** What the user was trying to achieve, written so it never reveals the answer. */
  goal: z.string(),
  /** How this user behaved — terse, verbose, sceptical, kept rephrasing. */
  persona: z.string(),
  /** What a good answer would contain. */
  rubric: z.string(),
  /**
   * Verbatim strings from the assistant's answers that look like the load-bearing facts —
   * candidates for `mustMention`, to be confirmed against the source documents by a human.
   */
  candidateFacts: z.array(z.string()),
  /** Whether this conversation is worth turning into a scenario at all. */
  usable: z.boolean(),
  /** Why not, when `usable` is false. */
  skipReason: z.string(),
})

export type ScenarioDraft = z.infer<typeof draftSchema> & {
  sourceConversationId: string
  needsReview: true
}

const SYSTEM_PROMPT = [
  'You convert a real conversation between a user and a company assistant into a benchmark scenario draft.',
  '',
  'Rules:',
  '- The goal must describe what the user wanted, in second person ("You need to know..."), with enough context that someone could pursue it without having seen this transcript.',
  '- The goal must NOT contain the answer. If the transcript says the rate is 2.4%, the goal says the user needs to know the rate, never what it is.',
  '- The persona describes how this particular user wrote: length, directness, whether they pushed back.',
  "- candidateFacts holds the specific values from the assistant's answers — figures, names, dates — copied verbatim. These are proposals for a human to verify, not assertions.",
  '- Set usable to false for conversations with no retrievable goal: greetings, one-word messages, pure chit-chat, or anything where the user never asked for information.',
].join('\n')

const renderTranscript = (transcript: TranscriptEntry[]): string =>
  transcript
    .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.text}`)
    .join('\n\n')

export const mineScenarioDraft = async (
  model: LanguageModelV3,
  conversationId: string,
  transcript: TranscriptEntry[]
): Promise<ScenarioDraft> => {
  const result = await ai.generateObject({
    model,
    schema: draftSchema,
    temperature: 0,
    system: SYSTEM_PROMPT,
    prompt: `Conversation:\n\n${renderTranscript(transcript)}`,
  })
  return { ...result.object, sourceConversationId: conversationId, needsReview: true }
}

/**
 * Assembles a runnable scenario from a reviewed draft. Kept separate from mining so a curated
 * draft can be replayed without another LLM call, and so the corpus — which the miner never sees —
 * is supplied explicitly by whoever knows which documents belong to it.
 */
export const scenarioFromDraft = (
  draft: ScenarioDraft,
  corpus: Scenario['corpus'],
  overrides: Partial<Scenario> = {}
): Scenario => ({
  id: `mined-${draft.sourceConversationId}`,
  description: `Derived from conversation ${draft.sourceConversationId}. Review the answer key before trusting results.`,
  corpus,
  goal: draft.goal,
  persona: draft.persona,
  maxTurns: 6,
  rubric: draft.rubric,
  answerKey: draft.candidateFacts.length > 0 ? { mustMention: draft.candidateFacts } : undefined,
  ...overrides,
})

import * as ai from 'ai'
import * as z from 'zod'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { Scenario, TranscriptEntry } from './types'

/**
 * The simulated user: an LLM that role-plays a person pursuing a goal against the assistant.
 *
 * The single most important property here is what this model is *not* told. It receives the goal
 * and the persona; it never receives the scenario's answer key or rubric. A simulated user that
 * knows the answer will leak it into its own question — "so the penalty is 1.5% per month,
 * right?" — and from that point every arm passes, including one that retrieves nothing at all.
 * Grading is therefore kept entirely on the judge's side of the wall.
 *
 * It also may not decide whether the answer is *correct*, only whether it was answered: it has no
 * way to know, and letting it grade would fold the same leak back in through the exit condition.
 */

/**
 * Every field is required-and-nullable rather than optional: OpenAI's strict structured-output
 * mode rejects a schema whose `required` does not list every property, so `.optional()` fails at
 * request time on that provider.
 */
const decisionSchema = z.object({
  /**
   * 'say' to continue the conversation, 'done' when the assistant has addressed the goal,
   * 'give-up' when it is clear the assistant cannot.
   */
  action: z.enum(['say', 'done', 'give-up']),
  /** The next user message. Non-null for 'say'. */
  message: z.string().nullable(),
  /** Why the user stopped. Non-null for 'give-up'. */
  reason: z.string().nullable(),
})

export type SimulatedUserDecision = z.infer<typeof decisionSchema>

const DEFAULT_PERSONA =
  'A normal professional user. Writes briefly and naturally, does not pad messages with pleasantries, and asks a follow-up when an answer is vague.'

const systemPrompt = (scenario: Scenario): string =>
  [
    'You are role-playing a human user talking to a company chat assistant. Stay in character.',
    '',
    `Your goal: ${scenario.goal}`,
    '',
    `How you behave: ${scenario.persona ?? DEFAULT_PERSONA}`,
    '',
    'Rules:',
    '- Write only what the user would type. No narration, no stage directions, no mention of being an AI or of this being a test.',
    '- You do NOT know the answer to your own question. Never state the answer, never suggest it, and never confirm a specific value the assistant has not given you. Getting it out of the assistant is the entire point.',
    '- Do not invent facts about your situation beyond your goal and persona.',
    '- Ask one thing at a time, the way a person would.',
    '- Choose "done" as soon as the assistant has addressed your goal, either by providing the requested information or by clearly establishing that the relevant sources do not contain it. Judging correctness is not your job.',
    '- A clear, source-based statement that the requested information is absent is a completed answer, not a reason to give up.',
    '- Choose "give-up" only when the assistant has neither answered nor established absence after repeated attempts.',
    '- Otherwise choose "say" and write your next message.',
  ].join('\n')

const renderTranscript = (transcript: TranscriptEntry[]): string => {
  if (transcript.length === 0)
    return '(The conversation has not started. Write your opening message.)'
  return transcript
    .map((entry) => `${entry.role === 'user' ? 'You' : 'Assistant'}: ${entry.text}`)
    .join('\n\n')
}

export interface SimulatedUser {
  next: (transcript: TranscriptEntry[]) => Promise<SimulatedUserDecision>
}

export const createSimulatedUser = (model: LanguageModelV3, scenario: Scenario): SimulatedUser => ({
  next: async (transcript) => {
    const result = await ai.generateObject({
      model,
      schema: decisionSchema,
      temperature: 0.3,
      system: systemPrompt(scenario),
      prompt: `Conversation so far:\n\n${renderTranscript(transcript)}\n\nDecide your next move.`,
    })
    return normalizeDecision(result.object, transcript)
  },
})

/**
 * Guards against the two ways a model breaks this contract: choosing 'say' with nothing to say,
 * and repeating its own previous message verbatim (which turns the run into a loop that burns the
 * turn budget without producing information). Both are treated as giving up.
 */
export const normalizeDecision = (
  decision: SimulatedUserDecision,
  transcript: TranscriptEntry[]
): SimulatedUserDecision => {
  if (decision.action !== 'say') return decision

  const message = decision.message?.trim()
  if (!message) {
    return {
      action: 'give-up',
      message: null,
      reason: 'Simulated user produced an empty message',
    }
  }

  const lastUserMessage = [...transcript].reverse().find((entry) => entry.role === 'user')?.text
  if (lastUserMessage && lastUserMessage.trim() === message) {
    return {
      action: 'give-up',
      message: null,
      reason: 'Simulated user repeated itself verbatim',
    }
  }

  return { action: 'say', message, reason: null }
}

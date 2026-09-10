import * as ai from 'ai'
import * as z from 'zod'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { JudgeVerdict, Scenario, TranscriptEntry } from './types'

/**
 * The judge: an LLM that grades a finished transcript against the scenario's rubric.
 *
 * It sees everything the simulated user was denied — the rubric and the answer key — because it
 * runs after the conversation is over and cannot influence it. It does not see which arm produced
 * the transcript, so it cannot develop a preference for one; the caller must not put arm names or
 * tool names in what it is given.
 *
 * The judge is deliberately the *second* opinion. `checkAnswerKey` has already decided whether the
 * required facts are present; the judge grades how well the goal was served, and its disagreements
 * with the deterministic check are worth reading, because they usually mean the scenario is
 * underspecified rather than that the model is wrong.
 */

/**
 * The range is stated in the prompt and clamped after the fact rather than encoded as `min`/`max`
 * here: OpenAI's structured-output mode ignores numeric bounds, and a judge that occasionally
 * answers 1.05 should cost one clamped value, not the whole data point.
 */
const verdictSchema = z.object({
  /** 0 = the goal was not achieved at all, 1 = fully achieved. */
  score: z.number(),
  /** One or two sentences. What the assistant did or failed to do. */
  reasoning: z.string(),
})

const SYSTEM_PROMPT = [
  'You grade transcripts of a conversation between a user and a company chat assistant.',
  "You are given the user's goal, a rubric, and the transcript. Grade only how well the assistant served the goal.",
  '',
  'Rules:',
  '- Judge the assistant, never the user.',
  '- An answer that is confident and wrong scores lower than an answer that admits it could not find the information.',
  '- Length, tone and formatting do not earn points. Only whether the user got what they came for.',
  '- Do not reward the assistant for restating the question or for describing how it searched.',
  '- Score 0 when the goal was not served at all, 1 when it was fully served, and use the range in between for partial answers.',
].join('\n')

const renderTranscript = (transcript: TranscriptEntry[]): string =>
  transcript
    .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.text}`)
    .join('\n\n')

const renderExpectations = (scenario: Scenario): string => {
  const lines = [`Rubric: ${scenario.rubric}`]
  const mustMention = scenario.answerKey?.mustMention ?? []
  if (mustMention.length > 0) {
    lines.push(`Facts a correct answer contains: ${mustMention.join('; ')}`)
  }
  const mustNotMention = scenario.answerKey?.mustNotMention ?? []
  if (mustNotMention.length > 0) {
    lines.push(`Wrong values that must not appear: ${mustNotMention.join('; ')}`)
  }
  return lines.join('\n')
}

export interface Judge {
  grade: (scenario: Scenario, transcript: TranscriptEntry[]) => Promise<JudgeVerdict>
}

export const createJudge = (model: LanguageModelV3): Judge => ({
  grade: async (scenario, transcript) => {
    const result = await ai.generateObject({
      model,
      schema: verdictSchema,
      temperature: 0,
      system: SYSTEM_PROMPT,
      prompt: [
        `User's goal: ${scenario.goal}`,
        '',
        renderExpectations(scenario),
        '',
        'Transcript:',
        '',
        renderTranscript(transcript),
      ].join('\n'),
    })
    return {
      score: Math.max(0, Math.min(1, result.object.score)),
      reasoning: result.object.reasoning.trim(),
    }
  },
})

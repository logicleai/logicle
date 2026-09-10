import { describe, expect, it } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import type { LanguageModelV3, LanguageModelV3GenerateResult } from '@ai-sdk/provider'
import { createSimulatedUser, normalizeDecision } from '@/backend/lib/eval/simulatedUser'
import { createJudge } from '@/backend/lib/eval/judge'
import type { Scenario, TranscriptEntry } from '@/backend/lib/eval/types'

const scenario: Scenario = {
  id: 'test',
  description: 'test scenario',
  corpus: [],
  goal: 'Find out the late payment interest rate for the Corvara contract.',
  persona: 'Terse procurement manager.',
  maxTurns: 4,
  rubric: 'The assistant states the Corvara rate.',
  answerKey: { mustMention: ['2.4%'], mustNotMention: ['0.9%'] },
}

/** Captures the prompt a model was given and replies with a canned JSON object. */
const recordingModel = (reply: unknown) => {
  const prompts: string[] = []
  const model = new MockLanguageModelV3({
    doGenerate: async ({ prompt }): Promise<LanguageModelV3GenerateResult> => {
      prompts.push(JSON.stringify(prompt))
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(reply) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      }
    },
  })
  return { model: model as unknown as LanguageModelV3, prompts }
}

describe('createSimulatedUser', () => {
  it('never puts the answer key in the prompt', async () => {
    // The whole benchmark is worthless if the simulated user can leak the answer into its own
    // question, so this is the most important assertion in the harness.
    const { model, prompts } = recordingModel({
      action: 'say',
      message: 'What is the rate?',
      reason: null,
    })
    await createSimulatedUser(model, scenario).next([])
    const everything = prompts.join(' ')
    expect(everything).not.toContain('2.4%')
    expect(everything).not.toContain('0.9%')
    expect(everything).not.toContain(scenario.rubric)
  })

  it('passes the goal and persona through', async () => {
    const { model, prompts } = recordingModel({ action: 'say', message: 'Hi', reason: null })
    await createSimulatedUser(model, scenario).next([])
    expect(prompts.join(' ')).toContain('Corvara')
    expect(prompts.join(' ')).toContain('Terse procurement manager')
  })

  it('includes the conversation so far', async () => {
    const { model, prompts } = recordingModel({
      action: 'say',
      message: 'And the notice period?',
      reason: null,
    })
    const transcript: TranscriptEntry[] = [
      { role: 'user', text: 'What is the rate?' },
      { role: 'assistant', text: 'It is stated in the contract.' },
    ]
    await createSimulatedUser(model, scenario).next(transcript)
    expect(prompts.join(' ')).toContain('It is stated in the contract.')
  })
})

describe('normalizeDecision', () => {
  it('passes a well-formed message through, trimmed', () => {
    expect(normalizeDecision({ action: 'say', message: '  hello  ', reason: null }, [])).toEqual({
      action: 'say',
      message: 'hello',
      reason: null,
    })
  })

  it('treats an empty message as giving up rather than sending nothing', () => {
    const decision = normalizeDecision({ action: 'say', message: '   ', reason: null }, [])
    expect(decision.action).toBe('give-up')
  })

  it('treats a verbatim repeat as giving up, so a stuck run cannot burn the turn budget', () => {
    const transcript: TranscriptEntry[] = [
      { role: 'user', text: 'What is the rate?' },
      { role: 'assistant', text: 'I cannot find it.' },
    ]
    const decision = normalizeDecision(
      { action: 'say', message: 'What is the rate?', reason: null },
      transcript
    )
    expect(decision.action).toBe('give-up')
    expect(decision.reason).toContain('repeated')
  })

  it('allows a rephrased follow-up', () => {
    const transcript: TranscriptEntry[] = [{ role: 'user', text: 'What is the rate?' }]
    expect(
      normalizeDecision({ action: 'say', message: 'Which rate applies?', reason: null }, transcript)
        .action
    ).toBe('say')
  })

  it('leaves done and give-up untouched', () => {
    expect(normalizeDecision({ action: 'done', message: null, reason: null }, []).action).toBe(
      'done'
    )
    expect(normalizeDecision({ action: 'give-up', message: null, reason: 'nope' }, []).reason).toBe(
      'nope'
    )
  })
})

describe('createJudge', () => {
  it('does receive the answer key, since it runs after the conversation', async () => {
    const { model, prompts } = recordingModel({ score: 1, reasoning: 'correct' })
    await createJudge(model).grade(scenario, [{ role: 'assistant', text: 'It is 2.4%.' }])
    expect(prompts.join(' ')).toContain('2.4%')
  })

  it('clamps an out-of-range score', async () => {
    const { model } = recordingModel({ score: 3, reasoning: 'enthusiastic' })
    const verdict = await createJudge(model).grade(scenario, [{ role: 'assistant', text: 'x' }])
    expect(verdict.score).toBe(1)
  })
})

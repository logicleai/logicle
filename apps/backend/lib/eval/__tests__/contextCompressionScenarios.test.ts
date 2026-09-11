import { describe, expect, it } from 'vitest'
import * as dto from '@/types/dto'
import { llmModels } from '@/lib/models'
import { countTextWithTokenizer } from '@/lib/chat/tokenizer'
import { setTokenizerCounter } from '@/backend/lib/chat/prompt-token-counter'
import { estimateHistoryMessageCosts } from '@/backend/lib/chat/token-estimator'
import { planMessageCompression } from '@/backend/lib/chat/compression-planner'
import { materializeReferenceChat } from '@/backend/lib/eval/referenceChat'
import {
  aboveTriggerIncompressibleTextScenario,
  belowTriggerAttachmentScenario,
  belowTriggerIncompressibleTextScenario,
  belowTriggerTextScenario,
  contextCompressionBoundaryScenarios,
  contextCompressionScenarios,
  tinyAttachmentOverheadScenario,
} from '@/backend/lib/eval/scenarios/contextCompression'

setTokenizerCounter({
  countText: async (tokenizer, text) => countTextWithTokenizer(tokenizer, text),
})

describe('context-compression boundary scenarios', () => {
  it('ships below-trigger text and attachment controls plus above-trigger incompressible cases', () => {
    expect(contextCompressionBoundaryScenarios.map((scenario) => scenario.id)).toEqual([
      belowTriggerTextScenario.id,
      belowTriggerAttachmentScenario.id,
      belowTriggerIncompressibleTextScenario.id,
      aboveTriggerIncompressibleTextScenario.id,
      tinyAttachmentOverheadScenario.id,
    ])
    expect(contextCompressionScenarios).toEqual(
      expect.arrayContaining(contextCompressionBoundaryScenarios)
    )
  })

  it('declares deterministic trigger expectations for every saved reference chat', () => {
    for (const scenario of contextCompressionScenarios) {
      expect(scenario.referenceChat?.compressionExpectation).toBeDefined()
    }
    expect(belowTriggerTextScenario.referenceChat?.compressionExpectation?.triggered).toBe(false)
    expect(belowTriggerAttachmentScenario.referenceChat?.compressionExpectation?.triggered).toBe(
      false
    )
    expect(
      belowTriggerIncompressibleTextScenario.referenceChat?.compressionExpectation?.triggered
    ).toBe(false)
    expect(
      aboveTriggerIncompressibleTextScenario.referenceChat?.compressionExpectation
    ).toMatchObject({ triggered: true, maxSummarizedMessages: 0 })
  })

  it('keeps the tiny attachment genuinely tiny', () => {
    expect(tinyAttachmentOverheadScenario.corpus).toHaveLength(1)
    expect(tinyAttachmentOverheadScenario.corpus[0]!.text.length).toBeLessThan(100)
  })

  it('anchors the text-only boundary fixtures to real gpt-4o-mini token estimates', async () => {
    const model = llmModels.find(({ id }) => id === 'gpt-4o-mini')
    if (!model) throw new Error('gpt-4o-mini model is not configured')

    const fixtures = [
      belowTriggerTextScenario,
      belowTriggerIncompressibleTextScenario,
      aboveTriggerIncompressibleTextScenario,
    ] as const
    const estimatedTokens: number[] = []

    for (const scenario of fixtures) {
      const referenceChat = scenario.referenceChat!
      const history = materializeReferenceChat(referenceChat, {
        conversationId: `boundary-${scenario.id}`,
        runId: 'token-estimate',
        files: [],
        corpus: scenario.corpus,
      })
      const finalUserMessage: dto.UserMessage = {
        id: `eval-final-${scenario.id}`,
        conversationId: `boundary-${scenario.id}`,
        parent: history.at(-1)?.id ?? null,
        sentAt: '2026-01-01T00:59:00.000Z',
        role: 'user',
        content: referenceChat.finalUserMessage,
        attachments: [],
      }
      const messages = [...history, finalUserMessage]
      const costs = await estimateHistoryMessageCosts(model, messages)
      const totalTokens = costs.reduce((sum, cost) => sum + cost.tokens, 0)
      estimatedTokens.push(totalTokens)

      const decisions = planMessageCompression(messages, 'conservative')
      const summarizedMessages = decisions.filter((decision) => decision.policy === 'summary')
      expect(summarizedMessages).toHaveLength(0)
      expect(referenceChat.compressionExpectation?.maxSummarizedMessages).toBe(0)
    }

    expect(estimatedTokens[0]).toBeLessThan(6000)
    expect(estimatedTokens[1]).toBeLessThan(6000)
    expect(estimatedTokens[2]).toBeGreaterThanOrEqual(6000)
    expect(belowTriggerTextScenario.referenceChat?.compressionExpectation?.triggered).toBe(false)
    expect(
      belowTriggerIncompressibleTextScenario.referenceChat?.compressionExpectation?.triggered
    ).toBe(false)
    expect(
      aboveTriggerIncompressibleTextScenario.referenceChat?.compressionExpectation
    ).toMatchObject({
      triggered: true,
      maxSummarizedMessages: 0,
    })
  })
})

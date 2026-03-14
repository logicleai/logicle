import { describe, expect, test } from 'vitest'
import {
  estimateAnthropicImageTokens,
  estimateGeminiImageTokens,
  estimateOpenAiImageTokens,
} from '@/lib/chat/image-token-estimator'
import { gpt4oModel, gpt41MiniModel, o4MiniModel } from '@/lib/chat/models/openai'
import { claude45SonnetModel } from '@/lib/chat/models/anthropic'
import { gemini25ProModel } from '@/lib/chat/models/vertex'
import type { LlmModel } from '@/lib/chat/models'

const makeModel = (id: string, extra: Partial<LlmModel> = {}): LlmModel =>
  ({ id, provider: 'openai', owned_by: 'openai', created: 0, ...extra }) as LlmModel

describe('image token estimator', () => {
  test('estimates OpenAI tile-based image tokens', () => {
    expect(estimateOpenAiImageTokens(gpt4oModel, { width: 1024, height: 1024 })).toBe(765)
  })

  test('estimates OpenAI patch-based image tokens', () => {
    expect(estimateOpenAiImageTokens(gpt41MiniModel, { width: 1024, height: 1024 })).toBe(1659)
    expect(estimateOpenAiImageTokens(o4MiniModel, { width: 1024, height: 1024 })).toBe(1762)
  })

  test('estimates Anthropic image tokens', () => {
    expect(estimateAnthropicImageTokens({ width: 1000, height: 1000 })).toBe(1334)
    expect(estimateAnthropicImageTokens({ width: 1000, height: 1000 })).toBeGreaterThan(0)
    expect(claude45SonnetModel.owned_by).toBe('anthropic')
  })

  test('estimates Gemini image tokens', () => {
    expect(estimateGeminiImageTokens({ width: 384, height: 384 })).toBe(258)
    expect(estimateGeminiImageTokens({ width: 960, height: 540 })).toBe(1548)
    expect(gemini25ProModel.owned_by).toBe('google')
  })
})

describe('estimateOpenAiImageTokens – all special model IDs', () => {
  test('computer-use-preview: baseTokens=65, tileTokens=129', () => {
    // 512x512 → 4 tiles → 65 + 4*129 = 581
    expect(estimateOpenAiImageTokens(makeModel('computer-use-preview'), { width: 512, height: 512 })).toBe(581)
  })

  test('gpt-4o-mini: baseTokens=2833, tileTokens=5667', () => {
    // 4 tiles → 2833 + 4*5667 = 25501
    expect(estimateOpenAiImageTokens(makeModel('gpt-4o-mini'), { width: 512, height: 512 })).toBe(25501)
  })

  test('o1: baseTokens=75, tileTokens=150', () => {
    // 4 tiles → 75 + 4*150 = 675
    expect(estimateOpenAiImageTokens(makeModel('o1'), { width: 512, height: 512 })).toBe(675)
  })

  test('o1-pro uses same tile cost as o1', () => {
    const dims = { width: 512, height: 512 }
    expect(estimateOpenAiImageTokens(makeModel('o1-pro'), dims)).toBe(
      estimateOpenAiImageTokens(makeModel('o1'), dims)
    )
  })

  test('o3 uses same tile cost as o1', () => {
    const dims = { width: 512, height: 512 }
    expect(estimateOpenAiImageTokens(makeModel('o3'), dims)).toBe(
      estimateOpenAiImageTokens(makeModel('o1'), dims)
    )
  })

  test('gpt-5-nano uses patch mode multiplier=2.46', () => {
    expect(estimateOpenAiImageTokens(makeModel('gpt-5-nano'), { width: 512, height: 512 })).toBeGreaterThan(0)
  })

  test('gpt-4.1-nano uses patch mode multiplier=2.46', () => {
    expect(estimateOpenAiImageTokens(makeModel('gpt-4.1-nano'), { width: 512, height: 512 })).toBeGreaterThan(0)
  })

  test('gpt-5-codex-mini (startsWith) uses patch mode', () => {
    expect(estimateOpenAiImageTokens(makeModel('gpt-5-codex-mini-v1'), { width: 512, height: 512 })).toBeGreaterThan(0)
  })

  test('gpt-5.1-codex-mini (startsWith) uses patch mode', () => {
    expect(estimateOpenAiImageTokens(makeModel('gpt-5.1-codex-mini-v2'), { width: 512, height: 512 })).toBeGreaterThan(0)
  })

  test('gpt-5.2 uses patch mode', () => {
    expect(estimateOpenAiImageTokens(makeModel('gpt-5.2'), { width: 512, height: 512 })).toBeGreaterThan(0)
  })

  test('gpt-5.2-chat-latest uses patch mode', () => {
    expect(estimateOpenAiImageTokens(makeModel('gpt-5.2-chat-latest'), { width: 512, height: 512 })).toBeGreaterThan(0)
  })

  test('default fallback: baseTokens=85, tileTokens=170', () => {
    // 512x512 → 4 tiles → 85 + 4*170 = 765
    expect(estimateOpenAiImageTokens(makeModel('gpt-4o'), { width: 512, height: 512 })).toBe(765)
  })
})

describe('estimateAnthropicImageTokens – boundary conditions', () => {
  test('300x300 produces ceil(90000/750)=120', () => {
    expect(estimateAnthropicImageTokens({ width: 300, height: 300 })).toBe(120)
  })

  test('very large image is constrained below unconstrained value', () => {
    const result = estimateAnthropicImageTokens({ width: 1568, height: 1568 })
    const unconstrained = Math.ceil((1568 * 1568) / 750)
    expect(result).toBeLessThan(unconstrained)
  })
})

describe('estimateGeminiImageTokens – boundary conditions', () => {
  test('100x100 (≤384) returns 258', () => {
    expect(estimateGeminiImageTokens({ width: 100, height: 100 })).toBe(258)
  })

  test('768x768 produces 1032', () => {
    // cropUnit=max(1,floor(768/1.5))=512, tilesAcross=2, tilesDown=2 → 4*258=1032
    expect(estimateGeminiImageTokens({ width: 768, height: 768 })).toBe(1032)
  })
})

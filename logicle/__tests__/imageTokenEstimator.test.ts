import { describe, expect, test } from 'vitest'
import {
  estimateAnthropicImageTokens,
  estimateGeminiImageTokens,
  estimateOpenAiImageTokens,
} from '@/lib/chat/image-token-estimator'
import { gpt4oModel, gpt41MiniModel, o4MiniModel } from '@/lib/chat/models/openai'
import { claude45SonnetModel } from '@/lib/chat/models/anthropic'
import { gemini25ProModel } from '@/lib/chat/models/vertex'

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

import { describe, expect, test } from 'vitest'
import { predictPdfTokenCount, resolvePdfEstimatorModel } from '@/lib/chat/pdf-token-estimator'
import { gpt41MiniModel } from '@/lib/chat/models/openai'
import { claude45SonnetModel } from '@/lib/chat/models/anthropic'
import { gemini25ProModel } from '@/lib/chat/models/vertex'
import type { LlmModel } from '@/lib/chat/models'

const makeModel = (owned_by: string): LlmModel =>
  ({ id: 'test', provider: 'test', owned_by, created: 0 }) as unknown as LlmModel

describe('pdf token estimator', () => {
  test('resolves estimator models by engine owner', () => {
    expect(resolvePdfEstimatorModel(gpt41MiniModel)).toBeDefined()
    expect(resolvePdfEstimatorModel(claude45SonnetModel)).toBeDefined()
    expect(resolvePdfEstimatorModel(gemini25ProModel)).toMatchObject({
      model_type: 'per-page-default',
      weights: [0, 2000, 0],
    })
  })

  test('predicts non-negative values from the trained linear model', () => {
    const estimator = resolvePdfEstimatorModel(gpt41MiniModel)
    expect(estimator).toBeDefined()
    expect(
      Math.round(
        predictPdfTokenCount(estimator!, {
          visionPageCount: 2,
          pageCount: 5,
          textTokenCount: 1200,
        })
      )
    ).toBe(3940)
  })

  test('openai estimator has correct model_type', () => {
    expect(resolvePdfEstimatorModel(makeModel('openai')).model_type).toBe('linear')
  })

  test('anthropic estimator has correct model_type', () => {
    expect(resolvePdfEstimatorModel(makeModel('anthropic')).model_type).toBe('linear')
  })

  test('predictPdfTokenCount clamps pageCount to 1 minimum', () => {
    const model = resolvePdfEstimatorModel(makeModel('unknown'))
    // pageCount=0 → clamped to 1 → 0 + 0 + 2000*1 + 0 = 2000
    expect(predictPdfTokenCount(model, { visionPageCount: 0, pageCount: 0, textTokenCount: 0 })).toBe(2000)
  })

  test('predictPdfTokenCount clamps negative values to 0', () => {
    const model = resolvePdfEstimatorModel(makeModel('unknown'))
    const result = predictPdfTokenCount(model, {
      visionPageCount: -1,
      pageCount: 2,
      textTokenCount: -100,
    })
    expect(result).toBe(4000) // 0 + 0 + 2000*2 + 0
  })

  test('predictPdfTokenCount returns 0 for negative linear result', () => {
    const negModel: Parameters<typeof predictPdfTokenCount>[0] = {
      model_type: 'linear' as const,
      feature_keys: ['vision_page_count', 'page_count', 'text_token_count'],
      intercept: -10000,
      weights: [0, 0, 0],
      trained_at: '2026-01-01T00:00:00.000Z',
    }
    expect(predictPdfTokenCount(negModel, { visionPageCount: 0, pageCount: 1, textTokenCount: 0 })).toBe(0)
  })

  test('more vision pages increases openai estimate', () => {
    const m = resolvePdfEstimatorModel(makeModel('openai'))
    const low = predictPdfTokenCount(m, { pageCount: 5, visionPageCount: 0, textTokenCount: 100 })
    const high = predictPdfTokenCount(m, { pageCount: 5, visionPageCount: 3, textTokenCount: 100 })
    expect(high).toBeGreaterThan(low)
  })
})

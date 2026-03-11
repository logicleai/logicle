import { describe, expect, test } from 'vitest'
import { predictPdfTokenCount, resolvePdfEstimatorModel } from '@/lib/chat/pdf-token-estimator'
import { gpt41MiniModel } from '@/lib/chat/models/openai'
import { claude45SonnetModel } from '@/lib/chat/models/anthropic'
import { gemini25ProModel } from '@/lib/chat/models/vertex'

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
})

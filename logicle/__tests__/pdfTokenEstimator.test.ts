import { describe, expect, test } from 'vitest'
import { PdfDict, PdfName, PdfRef } from '@libpdf/core'
import {
  analyzePdfGraphics,
  normalizeExtractedText,
  predictPdfTokenCount,
  resolvePdfEstimatorModel,
} from '@/lib/chat/pdf-token-estimator'
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

  test('normalizes extracted text whitespace', () => {
    expect(normalizeExtractedText(' hello \n\t world  ')).toBe('hello world')
  })

  test('analyzes PDF graphics for inline images, xobjects, and geometry complexity', () => {
    const imageDict = new PdfDict()
    imageDict.set(PdfName.of('Subtype'), PdfName.of('Image'))
    const xObjectDict = new PdfDict()
    const imageRef = PdfRef.of(1, 0)
    xObjectDict.set(PdfName.of('Img1'), imageRef)
    const resources = new PdfDict()
    resources.set(PdfName.of('XObject'), xObjectDict)

    const pdf = {
      getObject: (ref: unknown) => (ref instanceof PdfRef ? imageDict : null),
    } as any
    const page = {
      index: 0,
      getContentBytes: () => new TextEncoder().encode('BI /W 1 /H 1 ID x EI /Img1 Do S f'),
      getResources: () => resources,
      extractText: () => ({ text: '' }),
    }

    expect(analyzePdfGraphics(pdf, page)).toEqual({
      imageCount: 2,
      geometryComplexity: 5,
    })
  })

  test('returns zero image count when resources lack xobjects', () => {
    const pdf = { getObject: () => null } as any
    const page = {
      index: 1,
      getContentBytes: () => new TextEncoder().encode('q Q'),
      getResources: () => null,
      extractText: () => ({ text: '' }),
    }

    expect(analyzePdfGraphics(pdf, page)).toEqual({
      imageCount: 0,
      geometryComplexity: 0,
    })
  })

  test('handles non-PdfName keys and non-PdfRef xobjects', () => {
    const imageDict = new PdfDict()
    imageDict.set(PdfName.of('Subtype'), PdfName.of('Image'))
    const xObjectDict = new PdfDict() as any
    xObjectDict.keys = () => [123]
    xObjectDict.get = () => imageDict
    const resources = new PdfDict()
    resources.set(PdfName.of('XObject'), xObjectDict)

    const pdf = { getObject: () => null } as any
    const page = {
      index: 1,
      getContentBytes: () => new TextEncoder().encode('/123 Do'),
      getResources: () => resources,
      extractText: () => ({ text: '' }),
    }

    expect(analyzePdfGraphics(pdf, page)).toEqual({
      imageCount: 1,
      geometryComplexity: 1,
    })
  })

  test('ignores xobjects that do not resolve to dictionaries or are never painted', () => {
    const xObjectDict = new PdfDict()
    xObjectDict.set(PdfName.of('Img3'), PdfRef.of(3, 0))
    xObjectDict.set(PdfName.of('Img4'), 'not-a-dict' as any)
    const resources = new PdfDict()
    resources.set(PdfName.of('XObject'), xObjectDict)

    const pdf = {
      getObject: (ref: unknown) => (String(ref) === '3 0 R' ? 'still-not-a-dict' : null),
    } as any
    const page = {
      index: 2,
      getContentBytes: () => new TextEncoder().encode('q Q'),
      getResources: () => resources,
      extractText: () => ({ text: '' }),
    }

    expect(analyzePdfGraphics(pdf, page)).toEqual({
      imageCount: 0,
      geometryComplexity: 0,
    })
  })

  test('counts zero usages for image xobjects that are present but never painted', () => {
    const imageDict = new PdfDict()
    imageDict.set(PdfName.of('Subtype'), PdfName.of('Image'))
    const xObjectDict = new PdfDict()
    xObjectDict.set(PdfName.of('Img5'), imageDict as any)
    const resources = new PdfDict()
    resources.set(PdfName.of('XObject'), xObjectDict)

    const pdf = { getObject: () => null } as any
    const page = {
      index: 4,
      getContentBytes: () => new TextEncoder().encode('q Q'),
      getResources: () => resources,
      extractText: () => ({ text: '' }),
    }

    expect(analyzePdfGraphics(pdf, page)).toEqual({
      imageCount: 0,
      geometryComplexity: 0,
    })
  })
})

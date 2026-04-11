import { describe, expect, test } from 'vitest'
import {
  isGeminiImageModel,
  isImageEditingSupportedModel,
  isImagenImageModel,
  isOpenAiImageModel,
  isTogetherImageModel,
} from '@/backend/lib/imagegen/models'

describe('image generation model capabilities', () => {
  test('tracks provider-specific model families without central routing', () => {
    expect(isOpenAiImageModel('gpt-image-1')).toBe(true)
    expect(isOpenAiImageModel('dall-e-3')).toBe(true)
    expect(isGeminiImageModel('gemini-2.5-flash-image')).toBe(true)
    expect(isImagenImageModel('imagen-4.0-generate-001')).toBe(true)
    expect(isTogetherImageModel('FLUX.1-kontext-max')).toBe(true)
    expect(isOpenAiImageModel('imagen-4.0-generate-001')).toBe(false)
  })

  test('tracks editing-capable models explicitly', () => {
    expect(isImageEditingSupportedModel('gpt-image-1')).toBe(true)
    expect(isImageEditingSupportedModel('gemini-3-pro-image-preview')).toBe(true)
    expect(isImageEditingSupportedModel('FLUX.1-kontext-pro')).toBe(true)
    expect(isImageEditingSupportedModel('dall-e-3')).toBe(false)
    expect(isImageEditingSupportedModel('imagen-4.0-generate-001')).toBe(false)
  })
})

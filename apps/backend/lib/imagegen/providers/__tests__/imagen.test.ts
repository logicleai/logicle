import { describe, expect, it, vi } from 'vitest'
import { generateWithImagen } from '../imagen'
import type { ImageGenerationRequest } from '../../types'

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const mockGenerateImages = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateImages: mockGenerateImages }
  },
}))

const baseRequest: ImageGenerationRequest = {
  apiKey: 'key',
  model: 'imagen-4.0-generate-001',
  prompt: 'a sunset',
}

describe('generateWithImagen', () => {
  it('drops generated images with no image bytes', async () => {
    mockGenerateImages.mockResolvedValue({
      generatedImages: [{ image: { imageBytes: 'abc' } }, { image: {} }, {}],
    })

    const result = await generateWithImagen(baseRequest)

    expect(result.data).toEqual([{ b64_json: 'abc' }])
  })

  it('throws when none of the generated images contain data', async () => {
    mockGenerateImages.mockResolvedValue({ generatedImages: [{ image: {} }] })

    await expect(generateWithImagen(baseRequest)).rejects.toThrow(/No image data received/)
  })

  it('throws when the response has no generatedImages at all', async () => {
    mockGenerateImages.mockResolvedValue({})

    await expect(generateWithImagen(baseRequest)).rejects.toThrow(/No image data received/)
  })

  it('only forwards aspectRatio when provided', async () => {
    mockGenerateImages.mockResolvedValue({ generatedImages: [{ image: { imageBytes: 'x' } }] })

    await generateWithImagen(baseRequest)
    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({ config: { numberOfImages: 1 } })
    )

    await generateWithImagen({ ...baseRequest, aspectRatio: '16:9', n: 2 })
    expect(mockGenerateImages).toHaveBeenCalledWith(
      expect.objectContaining({ config: { numberOfImages: 2, aspectRatio: '16:9' } })
    )
  })
})

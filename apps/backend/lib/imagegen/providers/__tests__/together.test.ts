import { describe, expect, it, vi } from 'vitest'
import { generateWithTogether, editWithTogether } from '../together'
import type { ImageEditRequest, ImageGenerationRequest } from '../../types'

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const mockGenerate = vi.fn()

vi.mock('together-ai', () => ({
  Together: class {
    images = { generate: mockGenerate }
  },
}))

const baseRequest: ImageGenerationRequest = {
  apiKey: 'key',
  model: 'FLUX.1-schnell',
  prompt: 'a river',
}

describe('generateWithTogether', () => {
  it('prefixes the model with the black-forest-labs namespace', async () => {
    mockGenerate.mockResolvedValue({ data: [] })

    await generateWithTogether(baseRequest)

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'black-forest-labs/FLUX.1-schnell' })
    )
  })

  it('parses a WxH size string, falling back to 1024x1024 when malformed or missing', async () => {
    mockGenerate.mockResolvedValue({ data: [] })

    await generateWithTogether({ ...baseRequest, size: '768x512' })
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ width: 768, height: 512 }))

    await generateWithTogether({ ...baseRequest, size: 'not-a-size' })
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, height: 1024 })
    )

    await generateWithTogether(baseRequest)
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, height: 1024 })
    )
  })

  it('drops items with no b64_json and tags the rest as png', async () => {
    mockGenerate.mockResolvedValue({ data: [{ b64_json: 'abc' }, {}] })

    const result = await generateWithTogether(baseRequest)

    expect(result.data).toEqual([{ b64_json: 'abc', mimeType: 'image/png' }])
  })
})

describe('editWithTogether', () => {
  const editRequest: ImageEditRequest = {
    ...baseRequest,
    images: [{ data: Buffer.from('source'), fileName: 'a.png', mimeType: 'image/jpeg' }],
  }

  it('builds a data URL from the first source image', async () => {
    mockGenerate.mockResolvedValue({ data: [] })

    await editWithTogether(editRequest)

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        image_url: `data:image/jpeg;base64,${Buffer.from('source').toString('base64')}`,
      })
    )
  })

  it('drops items with no b64_json in the response', async () => {
    mockGenerate.mockResolvedValue({ data: [{ b64_json: 'edited' }, {}] })

    const result = await editWithTogether(editRequest)

    expect(result.data).toEqual([{ b64_json: 'edited', mimeType: 'image/png' }])
  })
})

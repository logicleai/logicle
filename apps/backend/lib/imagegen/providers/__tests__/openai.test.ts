import { describe, expect, it, vi } from 'vitest'
import { generateWithOpenAI, editWithOpenAI } from '../openai'
import type { ImageEditRequest, ImageGenerationRequest } from '../../types'

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const mockGenerate = vi.fn()
const mockEdit = vi.fn()

vi.mock('openai', () => ({
  default: class {
    images = { generate: mockGenerate, edit: mockEdit }
  },
}))

const baseRequest: ImageGenerationRequest = {
  apiKey: 'key',
  model: 'dall-e-3',
  prompt: 'a cat',
}

describe('generateWithOpenAI', () => {
  it('drops items with no b64_json instead of returning them as empty images', async () => {
    mockGenerate.mockResolvedValue({
      data: [{ b64_json: 'abc' }, { url: 'http://example.com/no-b64.png' }],
    })

    const result = await generateWithOpenAI(baseRequest)

    expect(result.data).toEqual([{ b64_json: 'abc' }])
  })

  it('requests response_format only for models that support it', async () => {
    mockGenerate.mockResolvedValue({ data: [] })

    await generateWithOpenAI({ ...baseRequest, model: 'dall-e-3' })
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: 'b64_json' })
    )

    await generateWithOpenAI({ ...baseRequest, model: 'gpt-image-1' })
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: undefined })
    )
  })

  it('falls back to a default size for unsupported/missing size values', async () => {
    mockGenerate.mockResolvedValue({ data: [] })

    await generateWithOpenAI({ ...baseRequest, size: 'not-a-real-size' })
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ size: '1024x1024' }))

    await generateWithOpenAI({ ...baseRequest, size: '1536x1024' })
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ size: '1536x1024' }))
  })

  it('defaults n to 1 when not provided', async () => {
    mockGenerate.mockResolvedValue({ data: [] })
    await generateWithOpenAI(baseRequest)
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ n: 1 }))
  })
})

describe('editWithOpenAI', () => {
  const editRequest: ImageEditRequest = {
    ...baseRequest,
    images: [{ data: Buffer.from('img'), fileName: 'a.png', mimeType: 'image/png' }],
  }

  it('drops items with no b64_json in the response', async () => {
    mockEdit.mockResolvedValue({ data: [{ b64_json: 'edited' }, {}] })

    const result = await editWithOpenAI(editRequest)

    expect(result.data).toEqual([{ b64_json: 'edited' }])
  })

  it('only includes a mask in the request when one is provided', async () => {
    mockEdit.mockResolvedValue({ data: [] })

    await editWithOpenAI(editRequest)
    expect(mockEdit).toHaveBeenCalledWith(expect.not.objectContaining({ mask: expect.anything() }))

    await editWithOpenAI({
      ...editRequest,
      mask: { data: Buffer.from('mask'), fileName: 'm.png', mimeType: 'image/png' },
    })
    expect(mockEdit).toHaveBeenCalledWith(expect.objectContaining({ mask: expect.anything() }))
  })
})

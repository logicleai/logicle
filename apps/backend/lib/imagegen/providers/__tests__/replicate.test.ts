import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { generateWithReplicate } from '../replicate'
import type { ImageGenerationRequest } from '../../types'

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const mockCreate = vi.fn()
const mockWait = vi.fn()

vi.mock('replicate', () => ({
  default: class {
    predictions = { create: mockCreate }
    wait = mockWait
  },
}))

const baseRequest: ImageGenerationRequest = {
  apiKey: 'key',
  model: 'owner/model:version',
  prompt: 'a mountain',
}

describe('generateWithReplicate', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockCreate.mockResolvedValue({ id: 'pred-1' })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('throws when the prediction output is not a single image URL', async () => {
    mockWait.mockResolvedValue({ output: [42] })

    await expect(generateWithReplicate(baseRequest)).rejects.toThrow(/did not return an image URL/)
  })

  it('throws when the prediction output is an empty array', async () => {
    mockWait.mockResolvedValue({ output: [] })

    await expect(generateWithReplicate(baseRequest)).rejects.toThrow(/did not return an image URL/)
  })

  it('throws when downloading the generated image fails', async () => {
    mockWait.mockResolvedValue({ output: ['http://example.com/img.png'] })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any

    await expect(generateWithReplicate(baseRequest)).rejects.toThrow(/Failed downloading.*503/)
  })

  it('downloads and base64-encodes the first output image, using the response content-type', async () => {
    mockWait.mockResolvedValue({ output: ['http://example.com/img.png'] })
    const bytes = new TextEncoder().encode('image-bytes')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes.buffer,
      headers: new Headers({ 'content-type': 'image/webp' }),
    }) as any

    const result = await generateWithReplicate(baseRequest)

    expect(result.data).toEqual([
      { b64_json: Buffer.from(bytes).toString('base64'), mimeType: 'image/webp' },
    ])
  })
})

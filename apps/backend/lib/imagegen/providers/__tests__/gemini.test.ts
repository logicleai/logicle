import { describe, expect, it, vi } from 'vitest'
import { generateWithGemini, editWithGemini } from '../gemini'
import type { ImageEditRequest, ImageGenerationRequest } from '../../types'

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const mockGenerateContentStream = vi.fn()
const mockGenerateContent = vi.fn()

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContentStream: mockGenerateContentStream,
        generateContent: mockGenerateContent,
      }
    }
  },
}))

async function* toAsyncIterable<T>(items: T[]) {
  for (const item of items) yield item
}

const baseRequest: ImageGenerationRequest = {
  apiKey: 'key',
  model: 'gemini-2.5-flash-image',
  prompt: 'a dog',
}

describe('generateWithGemini', () => {
  it('skips stream chunks with no inline image data and returns the first one that has it', async () => {
    mockGenerateContentStream.mockResolvedValue({
      stream: toAsyncIterable([
        { candidates: [{ content: { parts: [{ text: 'thinking...' }] } }] },
        {
          candidates: [
            { content: { parts: [{ inlineData: { data: 'b64-data', mimeType: 'image/png' } }] } },
          ],
        },
        {
          candidates: [
            { content: { parts: [{ inlineData: { data: 'later-data' } }] } },
          ],
        },
      ]),
    })

    const result = await generateWithGemini(baseRequest)

    expect(result.data).toEqual([{ b64_json: 'b64-data', mimeType: 'image/png' }])
  })

  it('throws when no chunk ever contains image data', async () => {
    mockGenerateContentStream.mockResolvedValue({
      stream: toAsyncIterable([{ candidates: [{ content: { parts: [{ text: 'no image' }] } }] }]),
    })

    await expect(generateWithGemini(baseRequest)).rejects.toThrow(/No image data received/)
  })
})

describe('editWithGemini', () => {
  const editRequest: ImageEditRequest = {
    ...baseRequest,
    images: [{ data: Buffer.from('source'), fileName: 'a.png', mimeType: 'image/png' }],
  }

  it('extracts the first inline image from the response parts', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: 'here' }, { inlineData: { data: 'edited-b64', mimeType: 'image/png' } }],
            },
          },
        ],
      },
    })

    const result = await editWithGemini(editRequest)

    expect(result.data).toEqual([{ b64_json: 'edited-b64', mimeType: 'image/png' }])
  })

  it('throws when the response has no image data', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { candidates: [{ content: { parts: [{ text: 'no image here' }] } }] },
    })

    await expect(editWithGemini(editRequest)).rejects.toThrow(/No image data received/)
  })

  it('base64-encodes source images into inlineData parts', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ inlineData: { data: 'x' } }] } }],
      },
    })

    await editWithGemini(editRequest)

    const call = mockGenerateContent.mock.calls[0][0]
    const imagePart = call.contents[0].parts[1]
    expect(imagePart.inlineData.mimeType).toBe('image/png')
    expect(imagePart.inlineData.data).toBe(Buffer.from('source').toString('base64'))
  })
})

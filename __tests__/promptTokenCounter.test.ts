import { beforeEach, describe, expect, test, vi } from 'vitest'

const { mockEstimateNativeImageTokens, mockGetFileWithId } = vi.hoisted(() => ({
  mockEstimateNativeImageTokens: vi.fn(),
  mockGetFileWithId: vi.fn(),
}))

vi.mock('@/backend/lib/chat/image-token-estimator', () => ({
  estimateNativeImageTokens: mockEstimateNativeImageTokens,
}))

vi.mock('@/models/file', () => ({
  getFileWithId: mockGetFileWithId,
}))

import {
  countModelMessageTokens,
  setTokenizerCounter,
} from '@/backend/lib/chat/prompt-token-counter'
import { dtoMessageToLlmMessage } from '@/backend/lib/chat/conversion'
import type { LlmModel } from '@/lib/chat/models'

const fakeModel = {
  id: 'gpt-5-latest',
  capabilities: { vision: true, supportedMedia: ['image/png'] },
} as unknown as LlmModel

describe('countModelMessageTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setTokenizerCounter({
      countText: vi.fn(async (_tokenizer, text: string) => text.length),
    })
    mockEstimateNativeImageTokens.mockResolvedValue(321)
  })

  test('counts tool-result image-data structurally instead of counting base64 payload as text', async () => {
    const base64Payload = 'a'.repeat(10000)
    const tokens = await countModelMessageTokens(fakeModel, {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_123',
          toolName: 'GenerateImage',
          output: {
            type: 'content',
            value: [
              { type: 'text', text: 'The tool displayed 1 images.' },
              { type: 'image-data', data: base64Payload, mediaType: 'image/png' },
            ],
          },
        },
      ],
    })

    expect(tokens).toBe(
      JSON.stringify({ toolCallId: 'call_123', toolName: 'GenerateImage' }).length +
        'The tool displayed 1 images.'.length +
        321
    )
    expect(mockEstimateNativeImageTokens).toHaveBeenCalledTimes(1)
  })

  test('counts LiteLLM tool-result image placeholders as text after conversion', async () => {
    const imageFile = {
      id: 'file_123',
      name: 'generated.png',
      path: 'files/generated.png',
      type: 'image/png',
      size: 456,
      uploaded: 1,
      encrypted: 0,
    }
    mockGetFileWithId.mockResolvedValue(imageFile)

    const llmMessage = await dtoMessageToLlmMessage(
      {
        id: 'tool-msg-1',
        role: 'tool',
        conversationId: 'conv-1',
        parent: 'assistant-msg-1',
        sentAt: new Date().toISOString(),
        citations: [],
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call_456',
            toolName: 'GenerateImage',
            result: {
              type: 'content',
              value: [
                { type: 'text', text: 'The tool displayed 1 images.' },
                {
                  type: 'file',
                  id: imageFile.id,
                  mimetype: imageFile.type,
                  name: imageFile.name,
                  size: imageFile.size,
                },
              ],
            },
          },
        ],
      },
      fakeModel.capabilities,
      'litellm.chat'
    )

    expect(llmMessage).toBeDefined()
    const tokens = await countModelMessageTokens(fakeModel, llmMessage!)
    const placeholderText = `File content was not inlined to reduce context bloat. Use read_file with id "${imageFile.id}" (${imageFile.name}) for on-demand inspection.`

    expect(tokens).toBe(
      JSON.stringify({ toolCallId: 'call_456', toolName: 'GenerateImage' }).length +
        JSON.stringify({
          attached_files: [
            {
              id: imageFile.id,
              name: imageFile.name,
              size: imageFile.size,
              mimetype: imageFile.type,
            },
          ],
        }).length +
        'The tool displayed 1 images.'.length +
        placeholderText.length
    )
    expect(mockEstimateNativeImageTokens).not.toHaveBeenCalled()
  })
})

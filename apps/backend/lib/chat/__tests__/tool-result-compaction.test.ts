import { describe, expect, it, vi } from 'vitest'
import { compactHistoricalToolResultsForPrompt } from '@/backend/lib/chat/tool-result-compaction'

vi.mock('@/models/turn-memory', () => ({
  getTurnMemoriesForConversation: vi.fn(async () => [
    {
      userMessageId: 'u1',
      answerSummary: 'summary text',
    },
  ]),
}))

describe('compactHistoricalToolResultsForPrompt', () => {
  it('keeps attachment ids in compressed user message descriptors', async () => {
    const messages = [
      {
        id: 'u1',
        conversationId: 'c1',
        parent: null,
        sentAt: '2026-07-05T00:00:00.000Z',
        role: 'user' as const,
        content: 'Please inspect this file.',
        attachments: [
          {
            id: 'file-123',
            mimetype: 'application/pdf',
            name: 'report.pdf',
            size: 1024,
          },
        ],
      },
      {
        id: 'u2',
        conversationId: 'c1',
        parent: 'u1',
        sentAt: '2026-07-05T00:01:00.000Z',
        role: 'user' as const,
        content: 'What is in the file?',
        attachments: [],
      },
    ]

    const compressed = await compactHistoricalToolResultsForPrompt(messages, 'c1', 'conservative')

    expect(compressed[0]).toMatchObject({
      content: '[Files attached in this turn (content not re-sent): report.pdf (id: file-123)]\nPlease inspect this file.',
      attachments: [],
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  collectAttachmentFileIds,
  defaultReplayKnowledgeQuestions,
  isReplayableLineage,
  parseKnowledgeReplayArms,
} from '@/backend/lib/eval/productionChatReplay'
import type * as dto from '@/types/dto'

const user = (overrides: Partial<dto.UserMessage> = {}): dto.UserMessage => ({
  id: 'user-1',
  conversationId: 'conversation-1',
  parent: null,
  sentAt: '2026-01-01T00:00:00.000Z',
  role: 'user' as const,
  content: 'Question',
  attachments: [],
  ...overrides,
})

describe('isReplayableLineage', () => {
  it('admits a text-only user/assistant lineage ending at the audited user turn', () => {
    expect(
      isReplayableLineage([
        user(),
        {
          id: 'assistant-1',
          conversationId: 'conversation-1',
          parent: 'user-1',
          sentAt: '2026-01-01T00:00:01.000Z',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Answer' }],
          finishReason: 'stop',
        },
        { ...user(), id: 'user-2', parent: 'assistant-1' },
      ])
    ).toBeUndefined()
  })

  it('admits an attachment-bearing user turn (bytes are resolved from object storage)', () => {
    expect(
      isReplayableLineage([
        user({
          attachments: [{ id: 'file-1', name: 'file.txt', mimetype: 'text/plain', size: 1 }],
        }),
      ])
    ).toBeUndefined()
  })

  it('rejects tool, authorization, or error activity that cannot be replayed', () => {
    expect(
      isReplayableLineage([
        user(),
        {
          id: 'tool-1',
          conversationId: 'conversation-1',
          parent: 'user-1',
          sentAt: '2026-01-01T00:00:01.000Z',
          role: 'tool',
          parts: [],
        },
      ])
    ).toContain('tool')
  })
})

describe('collectAttachmentFileIds', () => {
  it('returns every distinct attachment id in first-seen order', () => {
    expect(
      collectAttachmentFileIds([
        user({
          attachments: [
            { id: 'file-1', name: 'a.txt', mimetype: 'text/plain', size: 1 },
            { id: 'file-2', name: 'b.png', mimetype: 'image/png', size: 2 },
          ],
        }),
        {
          ...user(),
          id: 'user-2',
          attachments: [{ id: 'file-1', name: 'a.txt', mimetype: 'text/plain', size: 1 }],
        },
      ])
    ).toEqual(['file-1', 'file-2'])
  })

  it('returns nothing for a text-only lineage', () => {
    expect(collectAttachmentFileIds([user()])).toEqual([])
  })
})

describe('parseKnowledgeReplayArms', () => {
  it('defaults to the production assistant-knowledge behavior', () => {
    expect(parseKnowledgeReplayArms(undefined, true)).toEqual(['assistant-knowledge'])
    expect(parseKnowledgeReplayArms(undefined, false)).toEqual(['assistant-knowledge'])
  })

  it('parses, validates, and de-duplicates comparison arms', () => {
    expect(
      parseKnowledgeReplayArms(
        'assistant-knowledge, knowledge-box,knowledge-box-no-projections,knowledge-box',
        true
      )
    ).toEqual(['assistant-knowledge', 'knowledge-box', 'knowledge-box-no-projections'])
  })

  it('rejects unknown arms and box replay without a corpus', () => {
    expect(() => parseKnowledgeReplayArms('unknown', true)).toThrow('Unknown knowledge arm')
    expect(() => parseKnowledgeReplayArms('knowledge-box', false)).toThrow(
      'requires at least one configured assistant knowledge file'
    )
  })
})

describe('defaultReplayKnowledgeQuestions', () => {
  it('uses stable unique ids and retrieval-oriented prompts', () => {
    expect(new Set(defaultReplayKnowledgeQuestions.map((question) => question.id)).size).toBe(
      defaultReplayKnowledgeQuestions.length
    )
    expect(defaultReplayKnowledgeQuestions.every((question) => question.prompt.length > 20)).toBe(
      true
    )
  })
})

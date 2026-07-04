import { describe, expect, it } from 'vitest'
import { resolveFileOwner } from '@/backend/lib/tools/ownership'

describe('resolveFileOwner', () => {
  it('prefers an explicit rootOwner over any other hint', () => {
    const result = resolveFileOwner({
      rootOwner: { type: 'USER', id: 'root-user' },
      conversationId: 'conv-1',
      userId: 'user-1',
      assistantId: 'assistant-1',
    })

    expect(result).toEqual({ ownerType: 'USER', ownerId: 'root-user' })
  })

  it('falls back to the conversation when there is no rootOwner', () => {
    const result = resolveFileOwner({
      conversationId: 'conv-1',
      userId: 'user-1',
      assistantId: 'assistant-1',
    })

    expect(result).toEqual({ ownerType: 'CHAT', ownerId: 'conv-1' })
  })

  it('falls back to the user when there is no rootOwner or conversation', () => {
    const result = resolveFileOwner({
      userId: 'user-1',
      assistantId: 'assistant-1',
    })

    expect(result).toEqual({ ownerType: 'USER', ownerId: 'user-1' })
  })

  it('falls back to the assistant when nothing else is available', () => {
    const result = resolveFileOwner({
      userId: '',
      assistantId: 'assistant-1',
    })

    expect(result).toEqual({ ownerType: 'ASSISTANT', ownerId: 'assistant-1' })
  })
})

import { describe, expect, it } from 'vitest'
import type * as dto from '@/types/dto'
import { captureToolRequestContext } from '../toolRequestContext'

const message = (id: string, role: dto.Message['role']) => ({ id, role }) as dto.Message

describe('captureToolRequestContext', () => {
  it('captures the latest real user turn for a new chat run', () => {
    const messages = [
      message('old', 'user'),
      message('assistant', 'assistant'),
      message('new', 'user'),
    ]

    expect(captureToolRequestContext(messages, 'user-1', 'conversation-1')).toEqual({
      conversationId: 'conversation-1',
      messageId: 'new',
      userId: 'user-1',
    })
  })

  it('keeps the originating user message through a confirmation response', () => {
    const messages = [
      message('root', 'user'),
      message('pending', 'user-request'),
      message('approval', 'user-response'),
    ]

    expect(captureToolRequestContext(messages, 'user-1', 'conversation-1').messageId).toBe('root')
  })

  it('omits the message ID when there is no real user message', () => {
    expect(captureToolRequestContext([message('synthetic', 'user-request')], 'user-1')).toEqual({
      userId: 'user-1',
    })
  })
})

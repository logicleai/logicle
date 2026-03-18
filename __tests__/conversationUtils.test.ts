import { describe, expect, test } from 'vitest'
import {
  extractLinearConversation,
  flatten,
  getMessageAndDescendants,
  groupMessages,
} from '@/lib/chat/conversationUtils'
import type { MessageWithError } from '@/lib/chat/types'
import type * as dto from '@/types/dto'

// ---- Helpers ----

function userMsg(id: string, parent: string | null, sentAt = '2024-01-01T00:00:00.000Z'): MessageWithError {
  return {
    id,
    parent,
    sentAt,
    role: 'user',
    content: `msg-${id}`,
    attachments: [],
    conversationId: 'conv1',
  } as MessageWithError
}

function assistantMsg(id: string, parent: string | null, sentAt = '2024-01-01T00:00:01.000Z'): MessageWithError {
  return {
    id,
    parent,
    sentAt,
    role: 'assistant',
    parts: [],
    conversationId: 'conv1',
  } as MessageWithError
}

// ---- extractLinearConversation ----

describe('extractLinearConversation', () => {
  test('single root message returns itself', () => {
    const msg = userMsg('m1', null) as dto.Message
    expect(extractLinearConversation([msg], msg)).toEqual([msg])
  })

  test('returns chain from root to leaf in order', () => {
    const m1 = userMsg('m1', null) as dto.Message
    const m2 = userMsg('m2', 'm1') as dto.Message
    const m3 = userMsg('m3', 'm2') as dto.Message
    expect(extractLinearConversation([m1, m2, m3], m3)).toEqual([m1, m2, m3])
  })
})

// ---- flatten ----

describe('flatten', () => {
  test('empty list returns empty', () => {
    expect(flatten([])).toEqual([])
  })

  test('single message is its own leaf', () => {
    const m = userMsg('m1', null)
    expect(flatten([m])).toEqual([m])
  })

  test('linear chain returns messages in order', () => {
    const m1 = userMsg('m1', null, '2024-01-01T00:00:00.000Z')
    const m2 = userMsg('m2', 'm1', '2024-01-01T00:00:01.000Z')
    const m3 = userMsg('m3', 'm2', '2024-01-01T00:00:02.000Z')
    expect(flatten([m1, m2, m3])).toEqual([m1, m2, m3])
  })

  test('selects latest leaf by sentAt when no leafMessage given', () => {
    const root = userMsg('root', null, '2024-01-01T00:00:00.000Z')
    const branchA = userMsg('a', 'root', '2024-01-01T00:00:01.000Z')
    const branchB = userMsg('b', 'root', '2024-01-01T00:00:02.000Z')
    const result = flatten([root, branchA, branchB])
    expect(result[result.length - 1].id).toBe('b')
  })

  test('respects explicit leafMessage', () => {
    const root = userMsg('root', null, '2024-01-01T00:00:00.000Z')
    const branchA = userMsg('a', 'root', '2024-01-01T00:00:01.000Z')
    const branchB = userMsg('b', 'root', '2024-01-01T00:00:02.000Z')
    const result = flatten([root, branchA, branchB], 'a')
    expect(result[result.length - 1].id).toBe('a')
  })
})

// ---- getMessageAndDescendants ----

describe('getMessageAndDescendants', () => {
  test('returns only the target message in a flat list', () => {
    const m1 = userMsg('m1', null)
    const m2 = userMsg('m2', null)
    expect(getMessageAndDescendants('m1', [m1, m2])).toEqual([m1])
  })

  test('includes all descendants', () => {
    const root = userMsg('root', null)
    const child = userMsg('child', 'root')
    const grandchild = userMsg('grandchild', 'child')
    const unrelated = userMsg('other', null)
    const result = getMessageAndDescendants('root', [root, child, grandchild, unrelated])
    expect(result.map((m) => m.id).sort()).toEqual(['child', 'grandchild', 'root'])
  })

  test('returns empty for unknown id', () => {
    const m1 = userMsg('m1', null)
    expect(getMessageAndDescendants('nonexistent', [m1])).toEqual([])
  })
})

// ---- groupMessages ----

describe('groupMessages', () => {
  test('empty list returns empty groups', () => {
    expect(groupMessages([])).toEqual([])
  })

  test('single user message produces one user group', () => {
    const m = userMsg('m1', null)
    const groups = groupMessages([m])
    expect(groups).toHaveLength(1)
    expect(groups[0].actor).toBe('user')
  })

  test('user then assistant produces two groups', () => {
    const u = userMsg('u1', null, '2024-01-01T00:00:00.000Z')
    const a = assistantMsg('a1', 'u1', '2024-01-01T00:00:01.000Z')
    const groups = groupMessages([u, a])
    expect(groups).toHaveLength(2)
    expect(groups[0].actor).toBe('user')
    expect(groups[1].actor).toBe('assistant')
  })

  test('multiple turns produce alternating groups', () => {
    const u1 = userMsg('u1', null, '2024-01-01T00:00:00.000Z')
    const a1 = assistantMsg('a1', 'u1', '2024-01-01T00:00:01.000Z')
    const u2 = userMsg('u2', 'a1', '2024-01-01T00:00:02.000Z')
    const a2 = assistantMsg('a2', 'u2', '2024-01-01T00:00:03.000Z')
    const groups = groupMessages([u1, a1, u2, a2])
    expect(groups.map((g) => g.actor)).toEqual(['user', 'assistant', 'user', 'assistant'])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceRole } from '@/types/workspace'

const state = vi.hoisted(() => ({
  names: new Map<string, string>(),
  memberships: [] as Array<{ workspaceId: string; workspaceName: string; role: string }>,
  failUser: false,
  failMemberships: false,
  filters: [] as Array<{ table: string; column: string; value: string }>,
}))

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: (table: string) => {
      let selectedUserId = ''
      const query = {
        innerJoin: () => query,
        select: () => query,
        where: (column: string, _operator: string, value: string) => {
          state.filters.push({ table, column, value })
          if (table === 'User' && column === 'id') selectedUserId = value
          return query
        },
        executeTakeFirst: async () => {
          if (state.failUser) throw new Error('User lookup failed')
          const name = state.names.get(selectedUserId)
          return name === undefined ? undefined : { name }
        },
        execute: async () => {
          if (state.failMemberships) throw new Error('Membership lookup failed')
          return state.memberships
        },
      }
      return query
    },
  },
}))

vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn() } }))

import { buildMcpRequestMeta } from '../request-meta'

beforeEach(() => {
  state.names.clear()
  state.memberships = []
  state.failUser = false
  state.failMemberships = false
  state.filters = []
})

describe('buildMcpRequestMeta', () => {
  it('sends names with IDs and only memberships of the invoking assistant and user', async () => {
    state.names.set('user-1', 'Ada')
    state.memberships = [
      { workspaceId: 'workspace-1', workspaceName: 'Engineering', role: WorkspaceRole.OWNER },
      { workspaceId: 'workspace-1', workspaceName: 'Engineering', role: WorkspaceRole.OWNER },
      { workspaceId: 'workspace-2', workspaceName: 'Support', role: WorkspaceRole.EDITOR },
      { workspaceId: 'workspace-3', workspaceName: 'Bad role', role: 'UNKNOWN' },
    ]

    const result = await buildMcpRequestMeta({
      assistantId: 'child-assistant',
      userId: 'user-1',
      conversationId: 'synthetic-conversation',
      requestContext: {
        conversationId: 'root-conversation',
        messageId: 'root-message',
        userId: 'user-1',
      },
    })

    expect(result).toEqual({
      'logicle/conversationId': 'root-conversation',
      'logicle/messageId': 'root-message',
      'logicle/userId': 'user-1',
      'logicle/userName': 'Ada',
      'logicle/workspaceMemberships': [
        { workspaceId: 'workspace-1', workspaceName: 'Engineering', role: WorkspaceRole.OWNER },
        { workspaceId: 'workspace-2', workspaceName: 'Support', role: WorkspaceRole.EDITOR },
      ],
    })
    expect(state.filters).toContainEqual({
      table: 'WorkspaceMember',
      column: 'WorkspaceMember.userId',
      value: 'user-1',
    })
    expect(state.filters).toContainEqual({
      table: 'WorkspaceMember',
      column: 'AssistantSharing.assistantId',
      value: 'child-assistant',
    })
  })

  it('omits absent fields and empty memberships while preserving unrelated metadata', async () => {
    const result = await buildMcpRequestMeta({
      assistantId: 'assistant-1',
      userId: 'user-1',
      requestContext: { userId: 'user-1' },
      requestMeta: { traceId: 'trace-1', 'logicle/messageId': 'stale-id' },
    })

    expect(result).toEqual({ traceId: 'trace-1', 'logicle/userId': 'user-1' })
  })

  it('does not look up users or memberships without a user ID', async () => {
    const result = await buildMcpRequestMeta({
      assistantId: 'assistant-1',
      userId: '',
      requestContext: { conversationId: 'conversation-1' },
    })

    expect(result).toEqual({ 'logicle/conversationId': 'conversation-1' })
    expect(state.filters).toEqual([])
  })

  it('keeps independent fields when either lookup fails', async () => {
    state.failUser = true
    state.memberships = [
      { workspaceId: 'workspace-1', workspaceName: 'Engineering', role: WorkspaceRole.MEMBER },
    ]
    const withoutName = await buildMcpRequestMeta({ assistantId: 'assistant-1', userId: 'user-1' })
    expect(withoutName['logicle/userId']).toBe('user-1')
    expect(withoutName['logicle/userName']).toBeUndefined()
    expect(withoutName['logicle/workspaceMemberships']).toHaveLength(1)

    state.failUser = false
    state.names.set('user-1', 'Ada')
    state.failMemberships = true
    const withoutMemberships = await buildMcpRequestMeta({
      assistantId: 'assistant-1',
      userId: 'user-1',
    })
    expect(withoutMemberships['logicle/userName']).toBe('Ada')
    expect(withoutMemberships['logicle/workspaceMemberships']).toBeUndefined()
  })

  it('keeps user IDs isolated between concurrent calls', async () => {
    state.names.set('user-1', 'Ada')
    state.names.set('user-2', 'Grace')

    const [first, second] = await Promise.all([
      buildMcpRequestMeta({ assistantId: 'assistant-1', userId: 'user-1' }),
      buildMcpRequestMeta({ assistantId: 'assistant-1', userId: 'user-2' }),
    ])

    expect(first['logicle/userName']).toBe('Ada')
    expect(second['logicle/userName']).toBe('Grace')
    expect(first['logicle/userId']).toBe('user-1')
    expect(second['logicle/userId']).toBe('user-2')
  })
})

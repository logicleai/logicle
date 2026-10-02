import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceRole } from '@/types/workspace'

const state = vi.hoisted(() => ({
  memberships: [] as Array<{ workspaceId: string; role: string; workspaceName?: string }>,
  failMemberships: false,
  tables: [] as string[],
  filters: [] as Array<{ table: string; column: string; value: string }>,
}))

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: (table: string) => {
      state.tables.push(table)
      const query = {
        innerJoin: () => query,
        select: () => query,
        where: (column: string, _operator: string, value: string) => {
          state.filters.push({ table, column, value })
          return query
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
  state.memberships = []
  state.failMemberships = false
  state.tables = []
  state.filters = []
})

describe('buildMcpRequestMeta', () => {
  it('sends root IDs and exact roles without names or duplicate memberships', async () => {
    state.memberships = [
      ...Object.values(WorkspaceRole).map((role) => ({ workspaceId: role, role })),
      { workspaceId: 'OWNER', role: WorkspaceRole.OWNER, workspaceName: 'Private name' },
      { workspaceId: 'invalid-role', role: 'UNKNOWN' },
      { workspaceId: ' ', role: WorkspaceRole.MEMBER },
    ]

    const result = await buildMcpRequestMeta({
      assistantId: 'child-assistant',
      userId: 'fallback-user',
      conversationId: 'synthetic-conversation',
      requestContext: {
        conversationId: 'root-conversation',
        messageId: 'root-message',
        userId: 'root-user',
      },
    })

    expect(result).toEqual({
      'logicle/conversationId': 'root-conversation',
      'logicle/messageId': 'root-message',
      'logicle/userId': 'root-user',
      'logicle/workspaceMemberships': Object.values(WorkspaceRole).map((role) => ({
        workspaceId: role,
        role,
      })),
    })
    expect(state.tables).toEqual(['WorkspaceMember'])
    expect(state.filters).toContainEqual({
      table: 'WorkspaceMember',
      column: 'WorkspaceMember.userId',
      value: 'root-user',
    })
    expect(state.filters).toContainEqual({
      table: 'WorkspaceMember',
      column: 'AssistantSharing.assistantId',
      value: 'child-assistant',
    })
  })

  it('projects memberships to IDs and roles even if a row contains extra fields', async () => {
    state.memberships = [
      { workspaceId: 'workspace-1', role: WorkspaceRole.MEMBER, workspaceName: 'Private name' },
    ]
    const result = await buildMcpRequestMeta({ assistantId: 'assistant-1', userId: 'user-1' })
    expect(result).toEqual({
      'logicle/userId': 'user-1',
      'logicle/workspaceMemberships': [{ workspaceId: 'workspace-1', role: WorkspaceRole.MEMBER }],
    })
  })

  it('removes stale identity and names, preserves unrelated metadata, and leaves the input intact', async () => {
    const requestMeta = {
      traceId: 'trace-1',
      'other/provider': 'value',
      'logicle/messageId': 'stale-id',
      'logicle/userName': 'Private name',
      'logicle/workspaceMemberships': [
        { workspaceId: 'stale-workspace', workspaceName: 'Private workspace', role: 'OWNER' },
      ],
    }
    const original = structuredClone(requestMeta)
    const result = await buildMcpRequestMeta({
      assistantId: 'assistant-1',
      userId: 'user-1',
      requestContext: { userId: 'user-1' },
      requestMeta,
    })

    expect(result).toEqual({
      traceId: 'trace-1',
      'other/provider': 'value',
      'logicle/userId': 'user-1',
    })
    expect(requestMeta).toEqual(original)
  })

  it.each(['conversationId', 'messageId', 'userId'] as const)(
    'sends %s independently when the other scalars are unavailable',
    async (field) => {
      const result = await buildMcpRequestMeta({
        assistantId: 'assistant-1',
        userId: '',
        requestContext: { [field]: 'available-id' },
      })
      expect(result).toEqual({ [`logicle/${field}`]: 'available-id' })
    }
  )

  it('does not query memberships without a user ID or an assistant ID', async () => {
    await buildMcpRequestMeta({ assistantId: 'assistant-1', userId: '' })
    await buildMcpRequestMeta({ assistantId: '', userId: 'user-1' })
    expect(state.tables).toEqual([])
  })

  it('keeps identity fields when the membership lookup fails', async () => {
    state.failMemberships = true
    const result = await buildMcpRequestMeta({
      assistantId: 'assistant-1',
      userId: 'user-1',
      requestContext: { conversationId: 'conversation-1', messageId: 'message-1' },
    })
    expect(result).toEqual({
      'logicle/conversationId': 'conversation-1',
      'logicle/messageId': 'message-1',
      'logicle/userId': 'user-1',
    })
  })

  it('keeps user IDs isolated between concurrent calls', async () => {
    const [first, second] = await Promise.all([
      buildMcpRequestMeta({ assistantId: 'assistant-1', userId: 'user-1' }),
      buildMcpRequestMeta({ assistantId: 'assistant-1', userId: 'user-2' }),
    ])
    expect(first).toEqual({ 'logicle/userId': 'user-1' })
    expect(second).toEqual({ 'logicle/userId': 'user-2' })
  })

  it('omits empty scalars and a membership list containing only invalid entries', async () => {
    state.memberships = [
      { workspaceId: 'workspace-1', role: 'UNKNOWN' },
      { workspaceId: '', role: WorkspaceRole.MEMBER },
    ]
    expect(
      await buildMcpRequestMeta({
        assistantId: 'assistant-1',
        userId: '',
        conversationId: '',
        requestContext: { conversationId: '', messageId: '', userId: '' },
      })
    ).toEqual({})
    expect(await buildMcpRequestMeta({ assistantId: 'assistant-1', userId: 'user-1' })).toEqual({
      'logicle/userId': 'user-1',
    })
  })

  it('scopes memberships to each invoking assistant while retaining the root user', async () => {
    const requestContext = {
      conversationId: 'root-chat',
      messageId: 'root-message',
      userId: 'root-user',
    }
    await buildMcpRequestMeta({ assistantId: 'parent', userId: 'other-user', requestContext })
    await buildMcpRequestMeta({ assistantId: 'child', userId: 'other-user', requestContext })
    expect(
      state.filters
        .filter((filter) => filter.column === 'AssistantSharing.assistantId')
        .map((filter) => filter.value)
    ).toEqual(['parent', 'child'])
    expect(
      state.filters
        .filter((filter) => filter.column === 'WorkspaceMember.userId')
        .map((filter) => filter.value)
    ).toEqual(['root-user', 'root-user'])
  })
})

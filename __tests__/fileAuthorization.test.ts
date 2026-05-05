import { beforeEach, describe, expect, test, vi } from 'vitest'

type Row = Record<string, unknown>

const selectFromMock = vi.fn()
const canUserAccessAssistantMock = vi.fn()
const getUserWorkspaceMembershipsMock = vi.fn()

const tables: Record<string, Row[]> = {
  File: [],
  Conversation: [],
  ConversationSharing: [],
  Message: [],
  Tool: [],
  ToolSharing: [],
  User: [],
}

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: selectFromMock,
  },
}))

vi.mock('@/models/assistant', () => ({
  canUserAccessAssistant: canUserAccessAssistantMock,
}))

vi.mock('@/models/user', () => ({
  getUserWorkspaceMemberships: getUserWorkspaceMembershipsMock,
}))

function matches(row: Row, whereClauses: Array<{ column: string; op: string; value: unknown }>) {
  return whereClauses.every(({ column, op, value }) => {
    if (op === '=') return row[column] === value
    if (op === 'in') return Array.isArray(value) && value.includes(row[column])
    throw new Error(`Unsupported operator in test double: ${op}`)
  })
}

function mockDbQueries() {
  selectFromMock.mockImplementation((table: string) => {
    const whereClauses: Array<{ column: string; op: string; value: unknown }> = []
    const builder = {
      select: vi.fn(() => builder),
      selectAll: vi.fn(() => builder),
      // innerJoin is a no-op in the mock; test data must be pre-joined (denormalized rows)
      innerJoin: vi.fn(() => builder),
      where: vi.fn((column: string, op: string, value: unknown) => {
        whereClauses.push({ column, op, value })
        return builder
      }),
      executeTakeFirst: vi.fn(async () => {
        return tables[table].find((row) => matches(row, whereClauses))
      }),
      execute: vi.fn(async () => {
        return tables[table].filter((row) => matches(row, whereClauses))
      }),
    }
    return builder
  })
}

describe('file authorization', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    for (const key of Object.keys(tables)) {
      tables[key] = []
    }
    mockDbQueries()
    canUserAccessAssistantMock.mockResolvedValue(false)
    getUserWorkspaceMembershipsMock.mockResolvedValue([])
  })

  test('canAccess USER owner type (positive and negative)', async () => {
    const { canAccess } = await import('@/backend/lib/files/authorization')
    await expect(canAccess({ userId: 'u1' }, 'USER', 'u1')).resolves.toBe(true)
    await expect(canAccess({ userId: 'u2' }, 'USER', 'u1')).resolves.toBe(false)
  })

  test('canAccess CHAT owner type (positive and negative)', async () => {
    tables.Conversation.push({ id: 'c1', ownerId: 'u1' })

    const { canAccess } = await import('@/backend/lib/files/authorization')
    await expect(canAccess({ userId: 'u1' }, 'CHAT', 'c1')).resolves.toBe(true)
    await expect(canAccess({ userId: 'u2' }, 'CHAT', 'c1')).resolves.toBe(false)
  })

  test('canAccess CHAT allows any authenticated user when conversation is shared', async () => {
    tables.Conversation.push({ id: 'c-shared', ownerId: 'u-owner' })
    // Denormalized: ConversationSharing row includes Message.conversationId for the mock join
    tables.ConversationSharing.push({
      id: 'share-1',
      lastMessageId: 'msg-1',
      'Message.conversationId': 'c-shared',
    })

    const { canAccess } = await import('@/backend/lib/files/authorization')
    await expect(canAccess({ userId: 'u-owner' }, 'CHAT', 'c-shared')).resolves.toBe(true)
    await expect(canAccess({ userId: 'u-stranger' }, 'CHAT', 'c-shared')).resolves.toBe(true)
  })

  test('canAccess CHAT denies non-owner when conversation is not shared', async () => {
    tables.Conversation.push({ id: 'c-private', ownerId: 'u-owner' })

    const { canAccess } = await import('@/backend/lib/files/authorization')
    await expect(canAccess({ userId: 'u-stranger' }, 'CHAT', 'c-private')).resolves.toBe(false)
  })

  test('canAccess ASSISTANT owner type (positive and negative)', async () => {
    const { canAccess } = await import('@/backend/lib/files/authorization')

    canUserAccessAssistantMock.mockResolvedValueOnce(true)
    await expect(canAccess({ userId: 'u1' }, 'ASSISTANT', 'a1')).resolves.toBe(true)

    canUserAccessAssistantMock.mockResolvedValueOnce(false)
    await expect(canAccess({ userId: 'u1' }, 'ASSISTANT', 'a1')).resolves.toBe(false)
  })

  test('canAccess TOOL owner type supports public/workspace/private', async () => {
    tables.Tool.push({ id: 't-public', sharing: 'public' })
    tables.Tool.push({ id: 't-workspace', sharing: 'workspace' })
    tables.Tool.push({ id: 't-private', sharing: 'private' })
    tables.ToolSharing.push({ id: 'ts1', toolId: 't-workspace', workspaceId: 'w1' })
    tables.User.push({ id: 'u-admin', role: 'ADMIN' })
    tables.User.push({ id: 'u-user', role: 'USER' })

    getUserWorkspaceMembershipsMock.mockImplementation(async (userId: string) => {
      if (userId === 'u-workspace') return [{ id: 'w1', name: 'Workspace 1', role: 'MEMBER' }]
      return []
    })

    const { canAccess } = await import('@/backend/lib/files/authorization')

    await expect(canAccess({ userId: 'u-any' }, 'TOOL', 't-public')).resolves.toBe(true)
    await expect(canAccess({ userId: 'u-workspace' }, 'TOOL', 't-workspace')).resolves.toBe(true)
    await expect(canAccess({ userId: 'u-no-workspace' }, 'TOOL', 't-workspace')).resolves.toBe(false)
    await expect(canAccess({ userId: 'u-admin' }, 'TOOL', 't-private')).resolves.toBe(true)
    await expect(canAccess({ userId: 'u-user' }, 'TOOL', 't-private')).resolves.toBe(false)
  })

  test('canAccessFile keeps legacy unowned files readable', async () => {
    tables.File.push({ id: 'f-legacy' })
    const { canAccessFile } = await import('@/backend/lib/files/authorization')
    await expect(canAccessFile({ userId: 'u1' }, 'f-legacy')).resolves.toBe(true)
  })

  test('canAccessFile enforces ownership and supports shared-access fallback', async () => {
    tables.Conversation.push({ id: 'c1', ownerId: 'u-chat' })
    tables.File.push({ id: 'f1', ownerType: 'USER', ownerId: 'u-owner' })
    tables.File.push({ id: 'f2', ownerType: 'CHAT', ownerId: 'c1' })

    const { canAccessFile } = await import('@/backend/lib/files/authorization')

    await expect(canAccessFile({ userId: 'u-owner' }, 'f1')).resolves.toBe(true)
    await expect(canAccessFile({ userId: 'u-nope' }, 'f1')).resolves.toBe(false)
    await expect(canAccessFile({ userId: 'u-chat' }, 'f2')).resolves.toBe(true)
  })
})

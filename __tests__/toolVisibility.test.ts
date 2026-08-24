import { beforeEach, describe, expect, test, vi } from 'vitest'

type Row = Record<string, unknown>

const selectFromMock = vi.fn()
const getUserWorkspaceMembershipsMock = vi.fn()

const tables: Record<string, Row[]> = {
  Tool: [],
  ToolSharing: [],
  User: [],
}

vi.mock('db/database', () => ({
  db: {
    selectFrom: selectFromMock,
  },
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
      where: vi.fn((column: string, op: string, value: unknown) => {
        whereClauses.push({ column, op, value })
        return builder
      }),
      executeTakeFirst: vi.fn(async () => tables[table].find((row) => matches(row, whereClauses))),
      execute: vi.fn(async () => tables[table].filter((row) => matches(row, whereClauses))),
    }
    return builder
  })
}

describe('tool visibility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    for (const key of Object.keys(tables)) {
      tables[key] = []
    }
    mockDbQueries()
    getUserWorkspaceMembershipsMock.mockResolvedValue([])
  })

  test('filterVisibleToolIds includes public tools for any user', async () => {
    tables.Tool.push({ id: 't-public', sharing: 'public' })
    const { filterVisibleToolIds } = await import('@/models/tool')
    const visible = await filterVisibleToolIds({ userId: 'u-any' }, ['t-public'])
    expect(visible.has('t-public')).toBe(true)
  })

  test('filterVisibleToolIds includes workspace tools only for members of a sharing workspace', async () => {
    tables.Tool.push({ id: 't-workspace', sharing: 'workspace' })
    tables.ToolSharing.push({ id: 'ts1', toolId: 't-workspace', workspaceId: 'w1' })

    const { filterVisibleToolIds } = await import('@/models/tool')

    getUserWorkspaceMembershipsMock.mockResolvedValueOnce([{ id: 'w1', name: 'W1', role: 'MEMBER' }])
    const visibleMember = await filterVisibleToolIds({ userId: 'u-member' }, ['t-workspace'])
    expect(visibleMember.has('t-workspace')).toBe(true)

    getUserWorkspaceMembershipsMock.mockResolvedValueOnce([])
    const visibleOutsider = await filterVisibleToolIds({ userId: 'u-outsider' }, ['t-workspace'])
    expect(visibleOutsider.has('t-workspace')).toBe(false)
  })

  test('filterVisibleToolIds excludes private tools for a regular user', async () => {
    tables.Tool.push({ id: 't-private', sharing: 'private' })
    tables.User.push({ id: 'u-user', role: 'USER' })

    const { filterVisibleToolIds } = await import('@/models/tool')
    const visible = await filterVisibleToolIds({ userId: 'u-user' }, ['t-private'])
    expect(visible.has('t-private')).toBe(false)
  })

  test('filterVisibleToolIds includes private tools for an admin, using the userRole hint', async () => {
    tables.Tool.push({ id: 't-private', sharing: 'private' })

    const { filterVisibleToolIds } = await import('@/models/tool')
    const visible = await filterVisibleToolIds(
      { userId: 'u-admin', userRole: 'ADMIN' as never },
      ['t-private']
    )
    expect(visible.has('t-private')).toBe(true)
  })

  test('filterVisibleToolIds falls back to a DB role lookup when userRole is not provided', async () => {
    tables.Tool.push({ id: 't-private', sharing: 'private' })
    tables.User.push({ id: 'u-admin-no-hint', role: 'ADMIN' })

    const { filterVisibleToolIds } = await import('@/models/tool')
    const visible = await filterVisibleToolIds({ userId: 'u-admin-no-hint' }, ['t-private'])
    expect(visible.has('t-private')).toBe(true)
  })

  test('filterVisibleToolIds drops ids for tools that do not exist', async () => {
    const { filterVisibleToolIds } = await import('@/models/tool')
    const visible = await filterVisibleToolIds({ userId: 'u-any' }, ['missing-tool'])
    expect(visible.size).toBe(0)
  })

  test('canUserAccessTool delegates to filterVisibleToolIds for a single id', async () => {
    tables.Tool.push({ id: 't-public', sharing: 'public' })
    tables.Tool.push({ id: 't-private', sharing: 'private' })
    tables.User.push({ id: 'u-user', role: 'USER' })

    const { canUserAccessTool } = await import('@/models/tool')
    await expect(canUserAccessTool({ userId: 'u-user' }, 't-public')).resolves.toBe(true)
    await expect(canUserAccessTool({ userId: 'u-user' }, 't-private')).resolves.toBe(false)
  })
})

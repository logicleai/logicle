import { describe, expect, it, vi, beforeEach } from 'vitest'

type FileRow = { ownerType: string | null; ownerId: string | null } | undefined

const state: {
  file: FileRow
  conversation: { ownerId: string } | undefined
  conversationShared: boolean
  tool: { sharing: string } | undefined
  toolWorkspaceShared: boolean
  userRole: string | undefined
} = {
  file: undefined,
  conversation: undefined,
  conversationShared: false,
  tool: undefined,
  toolWorkspaceShared: false,
  userRole: undefined,
}

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: (table: string) => {
      switch (table) {
        case 'File':
          return {
            select: () => ({
              where: () => ({ executeTakeFirst: async () => state.file }),
            }),
          }
        case 'Conversation':
          return {
            select: () => ({
              where: () => ({ executeTakeFirst: async () => state.conversation }),
            }),
          }
        case 'ConversationSharing':
          return {
            innerJoin: () => ({
              where: () => ({
                select: () => ({
                  executeTakeFirst: async () =>
                    state.conversationShared ? { id: 'share-1' } : undefined,
                }),
              }),
            }),
          }
        case 'Tool':
          return {
            select: () => ({
              where: () => ({ executeTakeFirst: async () => state.tool }),
            }),
          }
        case 'ToolSharing':
          return {
            select: () => ({
              where: () => ({
                where: () => ({
                  executeTakeFirst: async () =>
                    state.toolWorkspaceShared ? { id: 'sharing-1' } : undefined,
                }),
              }),
            }),
          }
        case 'User':
          return {
            select: () => ({
              where: () => ({
                executeTakeFirst: async () =>
                  state.userRole ? { role: state.userRole } : undefined,
              }),
            }),
          }
        default:
          throw new Error(`Unexpected table in mock: ${table}`)
      }
    },
  },
}))

const mockCanUserAccessAssistant = vi.fn()
vi.mock('@/models/assistant', () => ({
  canUserAccessAssistant: (...args: unknown[]) => mockCanUserAccessAssistant(...args),
}))

const mockGetUserWorkspaceMemberships = vi.fn()
vi.mock('@/models/user', () => ({
  getUserWorkspaceMemberships: (...args: unknown[]) => mockGetUserWorkspaceMemberships(...args),
}))

const resetState = () => {
  state.file = undefined
  state.conversation = undefined
  state.conversationShared = false
  state.tool = undefined
  state.toolWorkspaceShared = false
  state.userRole = undefined
  mockCanUserAccessAssistant.mockReset()
  mockGetUserWorkspaceMemberships.mockReset().mockResolvedValue([])
}

beforeEach(resetState)

const importAuthorization = () => import('@/backend/lib/files/authorization')

describe('canAccessFile (read)', () => {
  it('denies access when the file does not exist', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = undefined
    await expect(canAccessFile({ userId: 'u1' }, 'missing')).resolves.toBe(false)
  })

  it('keeps legacy unowned files readable by anyone', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = { ownerType: null, ownerId: null }
    await expect(canAccessFile({ userId: 'anyone' }, 'f-legacy')).resolves.toBe(true)
  })

  it('lets a USER-owned file be read by its owner only', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = { ownerType: 'USER', ownerId: 'owner-1' }
    await expect(canAccessFile({ userId: 'owner-1' }, 'f1')).resolves.toBe(true)
    await expect(canAccessFile({ userId: 'someone-else' }, 'f1')).resolves.toBe(false)
  })

  it('lets a CHAT-owned file be read by the conversation owner', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = { ownerType: 'CHAT', ownerId: 'conv-1' }
    state.conversation = { ownerId: 'owner-1' }
    state.conversationShared = false
    await expect(canAccessFile({ userId: 'owner-1' }, 'f1')).resolves.toBe(true)
    await expect(canAccessFile({ userId: 'someone-else' }, 'f1')).resolves.toBe(false)
  })

  it('lets a CHAT-owned file be read by anyone holding a share on it', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = { ownerType: 'CHAT', ownerId: 'conv-1' }
    state.conversation = { ownerId: 'owner-1' }
    state.conversationShared = true
    await expect(canAccessFile({ userId: 'someone-else' }, 'f1')).resolves.toBe(true)
  })

  it('delegates ASSISTANT-owned reads to canUserAccessAssistant', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = { ownerType: 'ASSISTANT', ownerId: 'assistant-1' }
    mockCanUserAccessAssistant.mockResolvedValue(true)
    await expect(canAccessFile({ userId: 'u1' }, 'f1')).resolves.toBe(true)
    expect(mockCanUserAccessAssistant).toHaveBeenCalledWith('u1', 'assistant-1')

    mockCanUserAccessAssistant.mockResolvedValue(false)
    await expect(canAccessFile({ userId: 'u2' }, 'f1')).resolves.toBe(false)
  })

  it('lets anyone read a TOOL-owned file when the tool is publicly shared', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = { ownerType: 'TOOL', ownerId: 'tool-1' }
    state.tool = { sharing: 'public' }
    await expect(canAccessFile({ userId: 'anyone' }, 'f1')).resolves.toBe(true)
  })

  it('lets workspace members read a workspace-shared TOOL-owned file, others not', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = { ownerType: 'TOOL', ownerId: 'tool-1' }
    state.tool = { sharing: 'workspace' }

    mockGetUserWorkspaceMemberships.mockResolvedValue([])
    await expect(canAccessFile({ userId: 'outsider' }, 'f1')).resolves.toBe(false)

    mockGetUserWorkspaceMemberships.mockResolvedValue([{ id: 'ws-1' }])
    state.toolWorkspaceShared = true
    await expect(canAccessFile({ userId: 'member' }, 'f1')).resolves.toBe(true)

    state.toolWorkspaceShared = false
    await expect(canAccessFile({ userId: 'member-of-other-ws' }, 'f1')).resolves.toBe(false)
  })

  it('restricts a private TOOL-owned file to admins', async () => {
    const { canAccessFile } = await importAuthorization()
    state.file = { ownerType: 'TOOL', ownerId: 'tool-1' }
    state.tool = { sharing: 'private' }

    await expect(
      canAccessFile({ userId: 'regular-user', userRole: 'USER' as never }, 'f1')
    ).resolves.toBe(false)
    await expect(
      canAccessFile({ userId: 'admin-user', userRole: 'ADMIN' as never }, 'f1')
    ).resolves.toBe(true)
  })
})

describe('canWriteFile (write)', () => {
  it('denies writes when the file does not exist', async () => {
    const { canWriteFile } = await importAuthorization()
    state.file = undefined
    await expect(canWriteFile({ userId: 'u1' }, 'missing')).resolves.toBe(false)
  })

  it('lets the creator write a USER-owned file, no one else', async () => {
    const { canWriteFile } = await importAuthorization()
    state.file = { ownerType: 'USER', ownerId: 'creator-1' }
    await expect(canWriteFile({ userId: 'creator-1' }, 'f1')).resolves.toBe(true)
    await expect(canWriteFile({ userId: 'someone-else' }, 'f1')).resolves.toBe(false)
  })

  it('denies writes to a CHAT-owned file even for the conversation owner', async () => {
    const { canWriteFile } = await importAuthorization()
    state.file = { ownerType: 'CHAT', ownerId: 'conv-1' }
    // Content is only ever uploaded before the transfer to CHAT ownership happens;
    // once transferred, writes must go through a fresh USER-owned file instead.
    await expect(canWriteFile({ userId: 'conversation-owner' }, 'f1')).resolves.toBe(false)
  })

  it('denies writes to an ASSISTANT-owned file even for the assistant owner', async () => {
    const { canWriteFile } = await importAuthorization()
    state.file = { ownerType: 'ASSISTANT', ownerId: 'assistant-1' }
    mockCanUserAccessAssistant.mockResolvedValue(true)
    await expect(canWriteFile({ userId: 'assistant-owner' }, 'f1')).resolves.toBe(false)
  })

  it('denies writes to a TOOL-owned file even for an admin', async () => {
    const { canWriteFile } = await importAuthorization()
    state.file = { ownerType: 'TOOL', ownerId: 'tool-1' }
    await expect(
      canWriteFile({ userId: 'admin-user', userRole: 'ADMIN' as never }, 'f1')
    ).resolves.toBe(false)
  })

  it('denies writes to a legacy unowned file', async () => {
    const { canWriteFile } = await importAuthorization()
    state.file = { ownerType: null, ownerId: null }
    await expect(canWriteFile({ userId: 'anyone' }, 'f1')).resolves.toBe(false)
  })

  it('a user with only read access to a shared conversation cannot write its files', async () => {
    // This is the exact regression PR #1022 fixed: a shared-conversation reader
    // must not be able to overwrite the conversation's file content.
    const { canAccessFile, canWriteFile } = await importAuthorization()
    state.file = { ownerType: 'CHAT', ownerId: 'conv-1' }
    state.conversation = { ownerId: 'owner-1' }
    state.conversationShared = true

    await expect(canAccessFile({ userId: 'shared-reader' }, 'f1')).resolves.toBe(true)
    await expect(canWriteFile({ userId: 'shared-reader' }, 'f1')).resolves.toBe(false)
  })
})

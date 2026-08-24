import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { SimpleSession } from '@/types/session'

const getConversationWithBackendAssistant = vi.fn()
const canAccessFile = vi.fn()
const reassignUserOwnedFilesToConversation = vi.fn()
const createChatRun = vi.fn()

vi.mock('@/models/conversation', () => ({
  getConversationWithBackendAssistant,
}))
vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile,
}))
vi.mock('@/models/file', () => ({
  reassignUserOwnedFilesToConversation,
}))
vi.mock('@/backend/lib/chat/chatRuns', () => ({
  createChatRun,
  finalizeChatRun: vi.fn(),
  getChatRunById: vi.fn(),
  isChatRunAbortError: vi.fn(),
  persistAndPublishChatRunEvent: vi.fn(),
}))
vi.mock('@/backend/lib/tools/enumerate', () => ({
  availableToolsForAssistantVersion: vi.fn(),
}))
vi.mock('@/lib/MessageAuditor', () => ({ MessageAuditor: vi.fn() }))
vi.mock('@/lib/chat/conversationUtils', () => ({ extractLinearConversation: vi.fn() }))
vi.mock('@/lib/parameters', () => ({ getUserParameters: vi.fn() }))
const canUserAccessAssistant = vi.fn()
vi.mock('@/models/assistant', () => ({ assistantVersionFiles: vi.fn(), canUserAccessAssistant }))
vi.mock('@/models/message', () => ({ getMessages: vi.fn(), saveMessage: vi.fn() }))
vi.mock('@/models/userSecrets', () => ({ getUserSecretValue: vi.fn() }))
vi.mock('db/database', () => ({ db: {} }))
vi.mock('@/backend/lib/chat', () => ({ ChatAssistant: { build: vi.fn() } }))
vi.mock('@/backend/lib/chat/compression-planner', () => ({ warmCompressionCache: vi.fn() }))

const session: SimpleSession = {
  userId: 'attacker',
  userRole: 'USER',
  sessionId: 's1',
} as SimpleSession

const baseUserMessage = {
  id: 'm1',
  conversationId: 'c1',
  role: 'user' as const,
  content: 'hello',
  attachments: [{ id: 'other-tenant-file', name: 'secret.pdf', mimetype: 'application/pdf', size: 10 }],
  parent: null,
  sentAt: new Date().toISOString(),
  citations: [],
}

describe('startServerChatRun attachment authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConversationWithBackendAssistant.mockResolvedValue({
      conversation: { id: 'c1', ownerId: 'attacker' },
      assistant: { deleted: false, assistantId: 'a1', assistantVersionId: 'av1', model: 'gpt' },
      backend: {},
    })
    canUserAccessAssistant.mockResolvedValue(true)
  })

  test('rejects the message when the user no longer has access to the assistant', async () => {
    canUserAccessAssistant.mockResolvedValue(false)
    const { startServerChatRun } = await import('@/backend/lib/chat/startServerChatRun')

    const result = await startServerChatRun({
      userMessage: { ...baseUserMessage, attachments: [] },
      headers: new Headers(),
      session,
    })

    expect(canUserAccessAssistant).toHaveBeenCalledWith('attacker', 'a1')
    expect(createChatRun).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: 'You no longer have access to this assistant',
    })
  })

  test('rejects the message and never reassigns ownership when an attachment is not accessible', async () => {
    canAccessFile.mockResolvedValue(false)
    const { startServerChatRun } = await import('@/backend/lib/chat/startServerChatRun')

    const result = await startServerChatRun({
      userMessage: baseUserMessage,
      headers: new Headers(),
      session,
    })

    expect(canAccessFile).toHaveBeenCalledWith({ userId: 'attacker' }, 'other-tenant-file')
    expect(reassignUserOwnedFilesToConversation).not.toHaveBeenCalled()
    expect(createChatRun).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: 'Message references files that are not accessible to the current user',
    })
  })

  test('proceeds to reassign ownership when every attachment is accessible', async () => {
    canAccessFile.mockResolvedValue(true)
    createChatRun.mockReturnValue({ ok: false, run: { id: 'run-1' } })
    const { startServerChatRun } = await import('@/backend/lib/chat/startServerChatRun')

    const result = await startServerChatRun({
      userMessage: baseUserMessage,
      headers: new Headers(),
      session,
    })

    expect(canAccessFile).toHaveBeenCalledWith({ userId: 'attacker' }, 'other-tenant-file')
    expect(reassignUserOwnedFilesToConversation).toHaveBeenCalledWith({
      fileIds: ['other-tenant-file'],
      userId: 'attacker',
      conversationId: 'c1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(409)
    }
  })
})

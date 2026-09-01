import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { SimpleSession } from '@/types/session'

const getConversationWithBackendAssistant = vi.fn()
const createChatRun = vi.fn()
const finalizeChatRun = vi.fn()
const getChatRunById = vi.fn()
const isChatRunAbortError = vi.fn()
const persistAndPublishChatRunEvent = vi.fn()
const saveMessage = vi.fn()
const chatAssistantBuild = vi.fn()
const extractLinearConversation = vi.fn()

vi.mock('@/models/conversation', () => ({
  getConversationWithBackendAssistant,
}))
vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: vi.fn(),
}))
vi.mock('@/models/file', () => ({
  reassignUserOwnedFilesToConversation: vi.fn(),
}))
vi.mock('@/backend/lib/chat/chatRuns', () => ({
  createChatRun,
  finalizeChatRun,
  getChatRunById,
  isChatRunAbortError,
  persistAndPublishChatRunEvent,
}))
vi.mock('@/backend/lib/tools/enumerate', () => ({
  availableToolsForAssistantVersion: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/MessageAuditor', () => ({
  MessageAuditor: class {
    auditMessage = vi.fn()
  },
}))
vi.mock('@/lib/chat/conversationUtils', () => ({ extractLinearConversation }))
vi.mock('@/lib/parameters', () => ({ getUserParameters: vi.fn() }))
vi.mock('@/models/assistant', () => ({
  assistantVersionFiles: vi.fn().mockResolvedValue([]),
  canUserAccessAssistant: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/models/message', () => ({ getMessages: vi.fn().mockResolvedValue([]), saveMessage }))
vi.mock('@/models/userSecrets', () => ({ getUserSecretValue: vi.fn() }))
vi.mock('db/database', () => ({ db: {} }))
vi.mock('@/backend/lib/chat', () => ({ ChatAssistant: { build: chatAssistantBuild } }))
vi.mock('@/backend/lib/chat/compression-planner', () => ({ warmCompressionCache: vi.fn() }))

const session: SimpleSession = {
  userId: 'u1',
  userRole: 'USER',
  sessionId: 's1',
} as SimpleSession

const userMessage = {
  id: 'm1',
  conversationId: 'c1',
  role: 'user' as const,
  content: 'hello',
  attachments: [],
  parent: null,
  sentAt: new Date().toISOString(),
  citations: [],
}

describe('startServerChatRun failure events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConversationWithBackendAssistant.mockResolvedValue({
      conversation: { id: 'c1', ownerId: 'u1' },
      assistant: { deleted: false, assistantId: 'a1', assistantVersionId: 'av1', model: 'gpt' },
      backend: { providerType: 'openai', provisioned: 0, configuration: '{}' },
    })
    createChatRun.mockReturnValue({
      ok: true,
      run: { id: 'run-1', conversationId: 'c1' },
      abortController: new AbortController(),
    })
    extractLinearConversation.mockReturnValue([userMessage])
    getChatRunById.mockReturnValue(undefined)
    isChatRunAbortError.mockReturnValue(false)
  })

  test('publishes an assistant error message when the provider cannot be built', async () => {
    chatAssistantBuild.mockRejectedValue(new Error('provider exploded'))
    const { startServerChatRun } = await import('@/backend/lib/chat/startServerChatRun')

    const result = await startServerChatRun({
      userMessage,
      headers: new Headers(),
      session,
    })
    expect(result.ok).toBe(true)

    await vi.waitFor(() => {
      expect(finalizeChatRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-1', status: 'failed' })
      )
    })

    const publishedParts = persistAndPublishChatRunEvent.mock.calls.map(
      ([, part]) => part as { type: string }
    )
    expect(publishedParts.some((part) => part.type === 'message')).toBe(true)
    expect(publishedParts).toContainEqual({
      type: 'part',
      part: { type: 'error', error: 'Internal error' },
    })
    // The failure message must also be persisted, so it survives a reload
    expect(saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        parts: [{ type: 'error', error: 'Internal error' }],
      })
    )
  })

  test('does not publish an error message when the run was stopped', async () => {
    chatAssistantBuild.mockRejectedValue(new Error('aborted'))
    isChatRunAbortError.mockReturnValue(true)
    const { startServerChatRun } = await import('@/backend/lib/chat/startServerChatRun')

    const result = await startServerChatRun({
      userMessage,
      headers: new Headers(),
      session,
    })
    expect(result.ok).toBe(true)

    await vi.waitFor(() => {
      expect(finalizeChatRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-1', status: 'stopped' })
      )
    })

    expect(persistAndPublishChatRunEvent).not.toHaveBeenCalled()
  })
})

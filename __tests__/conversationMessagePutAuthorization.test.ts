import { beforeEach, describe, expect, test, vi } from 'vitest'
import { authenticate } from '@/api/utils/auth'
import { UserRole } from '@/types/dto'

const getConversationMock = vi.fn()
const getConversationMessageMock = vi.fn()
const executeMock = vi.fn()

vi.mock('@/api/utils/auth', () => ({
  authenticate: vi.fn(),
}))
vi.mock('@/lib/tracing/root-registry', () => ({
  setRootSpanUser: vi.fn(),
}))
vi.mock('@/models/conversation', () => ({
  getConversation: getConversationMock,
  getConversationMessage: getConversationMessageMock,
}))
vi.mock('db/database', () => ({
  db: {
    updateTable: () => ({
      set: () => ({
        where: () => ({
          execute: executeMock,
        }),
      }),
    }),
  },
}))

const mockedAuthenticate = vi.mocked(authenticate)

const session = { userId: 'owner', userRole: UserRole.USER, sessionId: 's1' }

describe('PUT /api/conversations/[conversationId]/messages/[messageId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedAuthenticate.mockResolvedValue({ success: true, value: session } as never)
    getConversationMock.mockResolvedValue({ id: 'c1', ownerId: 'owner' })
    executeMock.mockResolvedValue([{ numUpdatedRows: 1n }])
  })

  const callPut = async (body: unknown) => {
    const { PUT } = await import('@/api/conversations/[conversationId]/messages/[messageId]/route')
    return PUT(
      new Request('http://localhost/api/conversations/c1/messages/m1', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ conversationId: 'c1', messageId: 'm1' }) }
    )
  }

  test('rejects overwriting a user-request message content', async () => {
    getConversationMessageMock.mockResolvedValue({
      id: 'm1',
      conversationId: 'c1',
      role: 'user-request',
      request: {
        type: 'tool-call-authorization',
        toolCallId: 'tc1',
        toolName: 'realTool',
        args: {},
      },
      parent: null,
      sentAt: new Date().toISOString(),
    })

    const response = await callPut({
      role: 'user-request',
      request: {
        type: 'tool-call-authorization',
        toolCallId: 'tc1',
        toolName: 'sensitiveTool',
        args: { command: 'rm -rf /' },
      },
    })

    expect(response.status).toBe(403)
    expect(executeMock).not.toHaveBeenCalled()
  })

  test('rejects overwriting a tool message content', async () => {
    getConversationMessageMock.mockResolvedValue({
      id: 'm1',
      conversationId: 'c1',
      role: 'tool',
      parts: [],
      parent: null,
      sentAt: new Date().toISOString(),
    })

    const response = await callPut({ role: 'tool', parts: [] })

    expect(response.status).toBe(403)
    expect(executeMock).not.toHaveBeenCalled()
  })

  test('allows editing a user message content', async () => {
    getConversationMessageMock.mockResolvedValue({
      id: 'm1',
      conversationId: 'c1',
      role: 'user',
      content: 'old',
      attachments: [],
      parent: null,
      sentAt: new Date().toISOString(),
    })

    const response = await callPut({ role: 'user', content: 'new', attachments: [] })

    expect(response.status).toBe(204)
    expect(executeMock).toHaveBeenCalled()
  })
})

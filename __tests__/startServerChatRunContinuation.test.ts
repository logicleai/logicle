import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type * as dto from '@/types/dto'
import type { SimpleSession } from '@/types/session'

const { messages, build, processMessage, enumerateTools } = vi.hoisted(() => ({
  messages: [] as dto.Message[],
  build: vi.fn(),
  processMessage: vi.fn(),
  enumerateTools: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/models/conversation', () => ({
  getConversationWithBackendAssistant: vi.fn().mockResolvedValue({
    conversation: { id: 'c1', ownerId: 'u1' },
    assistant: { deleted: false, assistantId: 'a1', assistantVersionId: 'av1', model: 'gpt' },
    backend: { providerType: 'openai', provisioned: false, configuration: '{}' },
  }),
}))
vi.mock('@/backend/lib/files/authorization', () => ({ canAccessFile: vi.fn() }))
vi.mock('@/models/file', () => ({ reassignUserOwnedFilesToConversation: vi.fn() }))
vi.mock('@/backend/lib/tools/enumerate', () => ({
  availableToolsForAssistantVersion: enumerateTools,
}))
vi.mock('@/lib/MessageAuditor', () => ({
  MessageAuditor: class {
    auditMessage = vi.fn()
  },
}))
vi.mock('@/lib/parameters', () => ({ getUserParameters: vi.fn().mockResolvedValue({}) }))
vi.mock('@/models/assistant', () => ({
  assistantVersionFiles: vi.fn().mockResolvedValue([]),
  canUserAccessAssistant: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/models/message', () => ({
  getMessages: vi.fn(async () => structuredClone(messages)),
  saveMessage: vi.fn(async (message: dto.Message) => {
    messages.push(structuredClone(message))
  }),
}))
vi.mock('@/models/userSecrets', () => ({ getUserSecretValue: vi.fn() }))
vi.mock('db/database', () => ({ db: {} }))
vi.mock('@/backend/lib/chat', () => ({ ChatAssistant: { build } }))
vi.mock('@/backend/lib/chat/compression-planner', () => ({ warmCompressionCache: vi.fn() }))

import { startServerChatRun } from '@/backend/lib/chat/startServerChatRun'
import {
  closeChatRun,
  finalizeChatRun,
  getActiveChatRunForConversation,
  getChatRunById,
  listChatRunEvents,
} from '@/backend/lib/chat/chatRuns'

const session = { userId: 'u1', userRole: 'USER', sessionId: 's1' } as SimpleSession
const base = { conversationId: 'c1', sentAt: '2026-10-14T00:00:00.000Z' }
const request: dto.UserRequestMessage = {
  ...base,
  id: 'pause',
  role: 'user-request',
  parent: 'tool',
  request: { type: 'tool-step-limit', maxIterations: 30 },
}
const response = (id: string, allow = true): dto.UserResponseMessage => ({
  ...base,
  id,
  role: 'user-response',
  parent: request.id,
  allow,
})
const start = (userMessage: dto.Message) =>
  startServerChatRun({
    userMessage,
    headers: new Headers(),
    session,
  })

describe('server-side step-limit decisions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    messages.splice(
      0,
      messages.length,
      { ...base, id: 'user', role: 'user', parent: null, content: 'Work', attachments: [] },
      { ...base, id: 'tool', role: 'tool', parent: 'user', parts: [] },
      structuredClone(request)
    )
    build.mockResolvedValue({ processUserMessageWithSink: processMessage })
    processMessage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    const active = getActiveChatRunForConversation('c1')
    if (active) {
      finalizeChatRun({ runId: active.id, status: 'stopped' })
      closeChatRun(active.id)
    }
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  test('continues from persisted history and rejects a response from a stale tab', async () => {
    const result = await start(response('first'))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a run')
    await vi.waitFor(() => expect(getChatRunById(result.run.id)?.status).toBe('completed'))
    expect(processMessage).toHaveBeenCalledWith(messages, expect.anything())
    expect(build).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        requestContinuationOnStepLimit: true,
        requestContext: { conversationId: 'c1', messageId: 'user', userId: 'u1' },
      })
    )

    const duplicate = await start(response('second'))
    expect(duplicate).toMatchObject({ ok: false, status: 409 })
    expect(messages.filter((message) => message.role === 'user-response')).toHaveLength(1)
    expect(processMessage).toHaveBeenCalledTimes(1)
    expect(getActiveChatRunForConversation('c1')).toBeUndefined()
  })

  test('serializes simultaneous decisions while the first run is active', async () => {
    let finish!: () => void
    processMessage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const first = await start(response('first'))
    const second = await start(response('second'))
    expect(first.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, status: 409 })
    await vi.waitFor(() => expect(processMessage).toHaveBeenCalledTimes(1))
    finish()
    if (!first.ok) throw new Error('Expected a run')
    await vi.waitFor(() => expect(getChatRunById(first.run.id)?.status).toBe('completed'))
    expect(messages.filter((message) => message.role === 'user-response')).toHaveLength(1)
  })

  test('abort persists the choice and completes without loading tools or building a provider', async () => {
    const result = await start(response('abort', false))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected a run')
    expect(result.run.status).toBe('stopped')
    expect(messages.at(-1)).toEqual(response('abort', false))
    expect(build).not.toHaveBeenCalled()
    expect(enumerateTools).not.toHaveBeenCalled()
    expect(listChatRunEvents({ runId: result.run.id })).toEqual([])
    expect(getActiveChatRunForConversation('c1')).toBeUndefined()
    expect(await start(response('late-continue'))).toMatchObject({ ok: false, status: 409 })
  })

  test('rejects a continuation superseded by a new user message', async () => {
    messages.push({
      ...base,
      id: 'new-user',
      role: 'user',
      parent: request.id,
      content: 'Different task',
      attachments: [],
    })
    expect(await start(response('stale'))).toMatchObject({ ok: false, status: 409 })
    expect(build).not.toHaveBeenCalled()
  })

  test.each(['missing', 'tool'])('rejects a response targeting %s', async (parent) => {
    expect(await start({ ...response('invalid'), parent })).toMatchObject({
      ok: false,
      status: 400,
    })
    expect(messages).toHaveLength(3)
    expect(build).not.toHaveBeenCalled()
    expect(getActiveChatRunForConversation('c1')).toBeUndefined()
  })

  test('rejects malformed decisions before persisting them', async () => {
    expect(
      await start({ ...response('invalid'), allow: 'yes' } as unknown as dto.Message)
    ).toMatchObject({ ok: false, status: 400 })
    expect(messages).toHaveLength(3)
    expect(build).not.toHaveBeenCalled()
  })
})

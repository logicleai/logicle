import { describe, expect, test, vi, beforeEach } from 'vitest'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { ChatState } from '@/backend/lib/chat/ChatState'

// ── Heavy dependency mocks ────────────────────────────────────────────────────

vi.mock('@/models/assistant', () => ({
  canUserAccessAssistant: vi.fn().mockResolvedValue(true),
  getPublishedAssistantVersion: vi.fn().mockResolvedValue({
    id: 'av-1',
    backendId: 'backend-1',
    model: 'gpt-4o',
    systemPrompt: '',
    temperature: 0.7,
    tokenLimit: null,
    reasoning_effort: null,
  }),
  assistantVersionFiles: vi.fn().mockResolvedValue([]),
}))

vi.mock('db/database', () => ({
  db: {
    selectFrom: () => ({
      selectAll: () => ({
        where: () => ({
          executeTakeFirst: vi.fn().mockResolvedValue({
            id: 'backend-1',
            providerType: 'openai.chat',
            provisioned: false,
            configuration: JSON.stringify({ apiKey: 'test-key' }),
          }),
        }),
      }),
    }),
  },
}))

vi.mock('@/backend/lib/tools/enumerate', () => ({
  availableToolsForAssistantVersion: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/parameters', () => ({
  getUserParameters: vi.fn().mockResolvedValue({}),
}))

const mockInvokeLlm = vi.fn()
const mockBuild = vi.fn().mockResolvedValue({ invokeLlmAndProcessResponse: mockInvokeLlm })

vi.mock('@/backend/lib/chat', () => ({
  ChatAssistant: { build: mockBuild },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Populate chatState to simulate a sub-assistant that optionally calls a tool
 * producing files, then responds with a text message.
 */
function setupSubAssistantRun(
  files: Array<{ id: string; mimetype: string; name: string; size: number }>,
  replyText: string
) {
  mockInvokeLlm.mockImplementation(async (chatState: ChatState) => {
    const convId = chatState.conversationId

    if (files.length > 0) {
      const assistantCallMsg: dto.AssistantMessage = {
        id: nanoid(),
        role: 'assistant',
        conversationId: convId,
        parent: chatState.chatHistory[chatState.chatHistory.length - 1].id,
        sentAt: new Date().toISOString(),
        parts: [{ type: 'tool-call', toolCallId: 'call-img', toolName: 'GenerateImage', args: {} }],
      }
      chatState.appendMessage(assistantCallMsg)

      const toolMsg: dto.ToolMessage = {
        id: nanoid(),
        role: 'tool',
        conversationId: convId,
        parent: assistantCallMsg.id,
        sentAt: new Date().toISOString(),
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call-img',
            toolName: 'GenerateImage',
            result: {
              type: 'content',
              value: [
                { type: 'text', text: 'Image displayed.' },
                ...files.map((f) => ({ ...f, type: 'file' as const })),
              ],
            },
          },
        ],
      }
      chatState.appendMessage(toolMsg)
    }

    const assistantReplyMsg: dto.AssistantMessage = {
      id: nanoid(),
      role: 'assistant',
      conversationId: convId,
      parent: chatState.chatHistory[chatState.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      parts: [{ type: 'text', text: replyText }],
    }
    chatState.appendMessage(assistantReplyMsg)
  })
}

type InvokeParamsOverrides = {
  params?: Record<string, unknown>
  userId?: string
  conversationId?: string
  rootOwner?: { type: 'CHAT' | 'USER' | 'ASSISTANT'; id: string }
  toolCallId?: string
  toolName?: string
  assistantId?: string
  debug?: boolean
}

/** Build a minimal ToolInvokeParams-compatible object. */
function invokeParams(overrides: InvokeParamsOverrides = {}) {
  return {
    params: { assistantId: 'sub-assistant-id', input: 'do something' },
    userId: 'user-1',
    conversationId: 'parent-conv-id',
    rootOwner: { type: 'CHAT' as const, id: 'parent-conv-id' },
    toolCallId: 'tc-1',
    toolName: 'invoke_assistant',
    llmModel: {} as any,
    messages: [],
    assistantId: 'parent-assistant-id',
    uiLink: {} as any,
    debug: false,
    ...overrides,
  }
}

// ── Lazy import to give mocks time to register ────────────────────────────────

let invokeAssistant: (params: ReturnType<typeof invokeParams>) => Promise<dto.ToolCallResultOutput>

beforeEach(async () => {
  vi.clearAllMocks()
  mockBuild.mockResolvedValue({ invokeLlmAndProcessResponse: mockInvokeLlm })

  const { SubAssistantTool } = await import('../implementation')
  const tool = new SubAssistantTool(
    { name: 'invoke_assistant', id: 'tool-1' } as any,
    [{ id: 'sub-assistant-id', name: 'ImageBot', description: 'generates images' }]
  )
  const fns = await tool.functions({} as any, {} as any)
  const fn = fns['invoke_assistant']
  if (!fn || fn.type === 'provider') throw new Error('invoke_assistant not found or not a function tool')
  invokeAssistant = (p) => fn.invoke(p as any)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('invoke_assistant — file passthrough', () => {
  test('returns plain text when the sub-assistant produces no files', async () => {
    setupSubAssistantRun([], 'Sure, here is the answer.')

    const result = await invokeAssistant(invokeParams())

    expect(result).toEqual({ type: 'text', value: 'Sure, here is the answer.' })
  })

  test('returns content result with files when the sub-assistant tool produces images', async () => {
    setupSubAssistantRun(
      [{ id: 'img-001', mimetype: 'image/png', name: 'cat.png', size: 2048 }],
      'Here is the generated image.'
    )

    const result = await invokeAssistant(invokeParams())

    expect(result).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: 'Here is the generated image.' },
        { type: 'file', id: 'img-001', mimetype: 'image/png', name: 'cat.png', size: 2048 },
      ],
    })
  })

  test('includes multiple files when the sub-assistant tool produces several images', async () => {
    setupSubAssistantRun(
      [
        { id: 'img-001', mimetype: 'image/png', name: 'a.png', size: 100 },
        { id: 'img-002', mimetype: 'image/png', name: 'b.png', size: 200 },
      ],
      'Two images generated.'
    )

    const result = await invokeAssistant(invokeParams())

    expect(result.type).toBe('content')
    if (result.type !== 'content') return
    expect(result.value.filter((v) => v.type === 'file')).toHaveLength(2)
  })
})

describe('invoke_assistant — ownership', () => {
  test('forwards the parent rootOwner to ChatAssistant.build so sub-assistant files are owned by the parent chat', async () => {
    setupSubAssistantRun([], 'done')
    const parentRootOwner = { type: 'CHAT' as const, id: 'parent-conv-id' }

    await invokeAssistant(invokeParams({ rootOwner: parentRootOwner }))

    const buildOptions = mockBuild.mock.calls[0][5]
    expect(buildOptions.rootOwner).toEqual(parentRootOwner)
  })

  test('forwards the parent conversationId to ChatAssistant.build', async () => {
    setupSubAssistantRun([], 'done')

    await invokeAssistant(invokeParams({ conversationId: 'parent-conv-id' }))

    const buildOptions = mockBuild.mock.calls[0][5]
    expect(buildOptions.conversationId).toBe('parent-conv-id')
  })
})

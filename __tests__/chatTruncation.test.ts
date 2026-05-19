import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as ai from 'ai'

// --- infrastructure mocks (must come before ChatAssistant import) ---

const {
  mockDtoMessageToLlmMessage,
  mockSanitizeOrphanToolCalls,
  mockPrepareConversationCostPlan,
  mockLoggerInfo,
} =
  vi.hoisted(() => ({
    mockDtoMessageToLlmMessage: vi.fn(),
    mockSanitizeOrphanToolCalls: vi.fn((msgs: ai.ModelMessage[]) => msgs),
    mockPrepareConversationCostPlan: vi.fn(),
    mockLoggerInfo: vi.fn(),
  }))

vi.mock('@/backend/lib/chat/conversion', () => ({
  dtoMessageToLlmMessage: mockDtoMessageToLlmMessage,
  sanitizeOrphanToolCalls: mockSanitizeOrphanToolCalls,
}))

vi.mock('@/backend/lib/chat/token-estimator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/backend/lib/chat/token-estimator')>()
  return {
    ...actual,
    prepareConversationCostPlan: mockPrepareConversationCostPlan,
  }
})

vi.mock('@/db/database', () => ({ db: {} }))
vi.mock('@/db/dialect', () => ({ createDialect: () => null }))
vi.mock('@/lib/logging', () => ({
  logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}))
vi.mock('@/lib/env', () => ({
  default: {
    knowledge: { sendInPrompt: false },
    chat: {},
    provider: {},
    fileStorage: { location: '/tmp/test-storage' },
  },
}))
vi.mock('@/lib/satellite', () => ({ satelliteHub: { connections: [] } }))
vi.mock('@/backend/lib/tools/retrieve-file/implementation', () => ({}))

import { ChatAssistant } from '@/backend/lib/chat'
import * as dto from '@/types/dto'
import { LlmModel } from '@/lib/chat/models'
import type { LanguageModelV3 } from '@ai-sdk/provider'

// --- helpers ---

const makeMessage = (id: string, role: dto.Message['role'] = 'user'): dto.Message =>
  ({
    id,
    role,
    content: `content-${id}`,
    attachments: [],
    parts: [],
  }) as unknown as dto.Message

const makeLlmMessage = (id: string): ai.ModelMessage => ({
  role: 'user',
  content: `llm-${id}`,
})

const fakeLlmModel: LlmModel = {
  name: 'test-model',
  capabilities: { vision: false, supportedMedia: [] },
} as unknown as LlmModel

const fakeLanguageModel = {
  provider: 'openai.responses',
} as LanguageModelV3

// --- buildHistorySegments tests ---

describe('buildHistorySegments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('converts each message and returns history segments', async () => {
    const msg1 = makeMessage('m1')
    const msg2 = makeMessage('m2', 'assistant')
    mockDtoMessageToLlmMessage
      .mockResolvedValueOnce(makeLlmMessage('m1'))
      .mockResolvedValueOnce(makeLlmMessage('m2'))

    const segments = await ChatAssistant.buildHistorySegments(
      [msg1, msg2],
      fakeLlmModel,
      fakeLanguageModel
    )

    expect(segments).toHaveLength(2)
    expect(segments[0].scope).toBe('history')
    expect(segments[1].scope).toBe('history')
    expect(mockDtoMessageToLlmMessage).toHaveBeenCalledTimes(2)
  })

  test('marks the draft message with draft scope', async () => {
    const msg = makeMessage('m1')
    mockDtoMessageToLlmMessage.mockResolvedValue(makeLlmMessage('m1'))

    const segments = await ChatAssistant.buildHistorySegments(
      [msg],
      fakeLlmModel,
      fakeLanguageModel,
      'm1'
    )

    expect(segments[0].scope).toBe('draft')
  })

  test('filters out messages that convert to undefined', async () => {
    const msg1 = makeMessage('m1')
    const msg2 = makeMessage('m2')
    mockDtoMessageToLlmMessage.mockResolvedValueOnce(undefined).mockResolvedValueOnce(makeLlmMessage('m2'))

    const segments = await ChatAssistant.buildHistorySegments(
      [msg1, msg2],
      fakeLlmModel,
      fakeLanguageModel
    )

    expect(segments).toHaveLength(1)
    expect(mockDtoMessageToLlmMessage).toHaveBeenCalledTimes(2)
  })

  test('uses cache: shared messages are not converted twice', async () => {
    const msg1 = makeMessage('m1')
    const msg2 = makeMessage('m2')
    const msg3 = makeMessage('m3')
    mockDtoMessageToLlmMessage.mockImplementation(async (m: dto.Message) => makeLlmMessage(m.id))

    const cache = new Map<string, ai.ModelMessage>()

    // first call with all three messages
    await ChatAssistant.buildHistorySegments(
      [msg1, msg2, msg3],
      fakeLlmModel,
      fakeLanguageModel,
      undefined,
      cache
    )
    // second call with a suffix of the same messages (simulating a later trim candidate)
    await ChatAssistant.buildHistorySegments(
      [msg2, msg3],
      fakeLlmModel,
      fakeLanguageModel,
      undefined,
      cache
    )

    // msg2 and msg3 should have been converted only once despite appearing in both calls
    expect(mockDtoMessageToLlmMessage).toHaveBeenCalledTimes(3)
  })

  test('without cache: messages are converted on every call', async () => {
    const msg = makeMessage('m1')
    mockDtoMessageToLlmMessage.mockImplementation(async (m: dto.Message) => makeLlmMessage(m.id))

    await ChatAssistant.buildHistorySegments([msg], fakeLlmModel, fakeLanguageModel)
    await ChatAssistant.buildHistorySegments([msg], fakeLlmModel, fakeLanguageModel)

    expect(mockDtoMessageToLlmMessage).toHaveBeenCalledTimes(2)
  })
})

// --- truncateChat tests ---

// Minimal ChatAssistant factory — stubs out everything except truncateChat logic
const makeChatAssistant = (tokenLimit: number) => {
  const instance = Object.create(ChatAssistant.prototype) as ChatAssistant
  Object.assign(instance, {
    assistantParams: { tokenLimit, systemPrompt: '' },
    llmModel: fakeLlmModel,
    tools: [],
    parameters: {},
    knowledge: [],
  })
  return instance
}

describe('truncateChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrepareConversationCostPlan.mockImplementation(async ({ history }: { history: dto.Message[] }) => {
      return {
        plan: {
          assistantTokens: 10,
          draftTokens: 0,
          historyMessageCosts: history.map((m) => ({
            messageId: m.id,
            role: m.role,
            tokens: 10,
          })),
        },
        cache: {
          textTokensCache: { hits: 0, misses: 0 },
          fileTokenCache: { hits: 0, misses: 0 },
        },
      }
    })
    mockDtoMessageToLlmMessage.mockImplementation(async (m: dto.Message) => makeLlmMessage(m.id))
  })

  test('returns empty array unchanged', async () => {
    const assistant = makeChatAssistant(100)
    const result = await assistant.truncateChat([])
    expect(result).toEqual([])
    expect(mockPrepareConversationCostPlan).not.toHaveBeenCalled()
  })

  test('returns all messages when within token limit', async () => {
    const assistant = makeChatAssistant(100)
    const messages = [makeMessage('m1'), makeMessage('m2'), makeMessage('m3', 'assistant')]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages)
  })

  test('keeps history starting at index 0 when first message is user and total is within budget', async () => {
    const assistant = makeChatAssistant(40)
    const messages = [
      makeMessage('m1', 'user'),
      makeMessage('m2', 'assistant'),
      makeMessage('m3', 'user'),
    ]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages)
  })

  test('cost plan is built exactly once', async () => {
    const assistant = makeChatAssistant(25)
    const messages = [
      makeMessage('m1'),
      makeMessage('m2', 'assistant'),
      makeMessage('m3'),
      makeMessage('m4', 'assistant'),
      makeMessage('m5'),
    ]

    await assistant.truncateChat(messages)

    expect(mockPrepareConversationCostPlan).toHaveBeenCalledTimes(1)
  })

  test('drops earliest messages when full history exceeds limit', async () => {
    const assistant = makeChatAssistant(30)
    const messages = [
      makeMessage('m1'),
      makeMessage('m2', 'assistant'),
      makeMessage('m3'),
      makeMessage('m4', 'assistant'),
    ]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages.slice(2))
  })

  test('truncated history starts at a user message when history begins with assistant messages', async () => {
    const assistant = makeChatAssistant(35)
    const messages = [
      makeMessage('m1', 'assistant'),
      makeMessage('m2', 'assistant'),
      makeMessage('m3', 'user'),
      makeMessage('m4', 'assistant'),
    ]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages.slice(2))
    expect(result[0]?.role).toBe('user')
  })

  test('falls back to last user turn when even the shortest candidate exceeds limit', async () => {
    const assistant = makeChatAssistant(15)
    const messages = [
      makeMessage('m1'),
      makeMessage('m2', 'assistant'),
      makeMessage('m3'),
      makeMessage('m4', 'assistant'),
    ]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages.slice(2))
  })

  test('logs fallback accurately when latest user turn still exceeds the limit', async () => {
    const assistant = makeChatAssistant(15)
    const messages = [
      makeMessage('m1'),
      makeMessage('m2', 'assistant'),
      makeMessage('m3'),
      makeMessage('m4', 'assistant'),
    ]

    await assistant.truncateChat(messages)

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Truncating chat: latest user turn still exceeds limit of 15'
    )
  })

  test('falls back safely to index 0 when history has no user messages', async () => {
    const assistant = makeChatAssistant(15)
    const messages = [makeMessage('m1', 'assistant'), makeMessage('m2', 'assistant')]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages)
  })
})

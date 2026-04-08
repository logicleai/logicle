import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as ai from 'ai'

// --- infrastructure mocks (must come before ChatAssistant import) ---

const { mockDtoMessageToLlmMessage, mockSanitizeOrphanToolCalls, mockCountPromptSegmentsTokens } =
  vi.hoisted(() => ({
    mockDtoMessageToLlmMessage: vi.fn(),
    mockSanitizeOrphanToolCalls: vi.fn((msgs: ai.ModelMessage[]) => msgs),
    mockCountPromptSegmentsTokens: vi.fn(),
  }))

vi.mock('@/backend/lib/chat/conversion', () => ({
  dtoMessageToLlmMessage: mockDtoMessageToLlmMessage,
  sanitizeOrphanToolCalls: mockSanitizeOrphanToolCalls,
}))

vi.mock('@/backend/lib/chat/prompt-token-counter', () => ({
  countPromptSegmentsTokens: mockCountPromptSegmentsTokens,
}))

vi.mock('@/db/database', () => ({ db: {} }))
vi.mock('@/db/dialect', () => ({ createDialect: () => null }))
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
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

import { ChatAssistant, PromptSegment } from '@/backend/lib/chat'
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
    vi.spyOn(ChatAssistant, 'buildPreambleSegments')
    mockCountPromptSegmentsTokens.mockImplementation(async (_model, segments: PromptSegment[]) => {
      // Each segment counts as 10 tokens in its respective scope
      const counts = { assistant: 0, history: 0, draft: 0 }
      for (const s of segments) {
        if (s.scope === 'prompt') counts.assistant += 10
        else if (s.scope === 'history') counts.history += 10
        else counts.draft += 10
      }
      return counts
    })
    mockDtoMessageToLlmMessage.mockImplementation(async (m: dto.Message) => makeLlmMessage(m.id))
  })

  test('returns empty array unchanged', async () => {
    const assistant = makeChatAssistant(100)
    const result = await assistant.truncateChat([])
    expect(result).toEqual([])
    expect(ChatAssistant.buildPreambleSegments).not.toHaveBeenCalled()
  })

  test('returns all messages when within token limit', async () => {
    const assistant = makeChatAssistant(100)
    const messages = [makeMessage('m1'), makeMessage('m2'), makeMessage('m3', 'assistant')]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages)
  })

  test('buildPreambleSegments is called exactly once regardless of candidates tried', async () => {
    // preamble = 10 tokens; each history message = 10 tokens
    // limit = 25 → need to drop messages until only 1 or 2 history remain
    const assistant = makeChatAssistant(25)
    const messages = [
      makeMessage('m1'), // user — candidate start
      makeMessage('m2', 'assistant'),
      makeMessage('m3'), // user — candidate start
      makeMessage('m4', 'assistant'),
      makeMessage('m5'), // user — candidate start
    ]

    await assistant.truncateChat(messages)

    expect(ChatAssistant.buildPreambleSegments).toHaveBeenCalledTimes(1)
  })

  test('drops earliest messages when full history exceeds limit', async () => {
    // preamble=10, limit=30 → fits preamble + 2 history messages (10+10+10=30)
    const assistant = makeChatAssistant(30)
    const messages = [
      makeMessage('m1'), // user turn 1
      makeMessage('m2', 'assistant'),
      makeMessage('m3'), // user turn 2 — dropping m1+m2 gives 2 history msgs = 30 total ✓
      makeMessage('m4', 'assistant'),
    ]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages.slice(2)) // [m3, m4]
  })

  test('falls back to last user turn when even the shortest candidate exceeds limit', async () => {
    // preamble=10, limit=15 → no candidate fits; fallback to last user turn
    const assistant = makeChatAssistant(15)
    const messages = [
      makeMessage('m1'), // user
      makeMessage('m2', 'assistant'),
      makeMessage('m3'), // user — last user turn
      makeMessage('m4', 'assistant'),
    ]

    const result = await assistant.truncateChat(messages)

    expect(result).toEqual(messages.slice(2)) // [m3, m4]
  })
})

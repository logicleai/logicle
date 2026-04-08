import { beforeEach, describe, expect, test, vi } from 'vitest'

// --- hoisted mocks (referenced by vi.mock factories which are hoisted to file top) ---

const {
  mockStreamText,
  mockCanUserAccessAssistant,
  mockGetPublishedAssistantVersion,
  mockAssistantVersionFiles,
  mockAvailableToolsForAssistantVersion,
  mockGetUserParameters,
  mockExecuteTakeFirst,
} = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
  mockCanUserAccessAssistant: vi.fn().mockResolvedValue(true),
  mockGetPublishedAssistantVersion: vi.fn(),
  mockAssistantVersionFiles: vi.fn().mockResolvedValue([]),
  mockAvailableToolsForAssistantVersion: vi.fn().mockResolvedValue([]),
  mockGetUserParameters: vi.fn().mockResolvedValue({}),
  mockExecuteTakeFirst: vi.fn(),
}))

// ESM modules can't be spied on at runtime — mock the whole module,
// re-exporting everything real except streamText which we control per test.
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, streamText: mockStreamText }
})

// --- infrastructure mocks ---

vi.mock('@/backend/lib/chat/prompt-token-counter', () => ({
  countPromptSegmentsTokens: vi.fn().mockResolvedValue({ assistant: 0, history: 0, draft: 0 }),
}))

vi.mock('@/backend/lib/chat/token-estimator', () => ({
  estimateConversationWindowTokens: vi.fn().mockResolvedValue({
    estimate: { assistant: 0, history: 0, draft: 0, total: 0 },
    cache: {
      textTokensCache: { hits: 0, misses: 0 },
      fileTokenCache: { hits: 0, misses: 0 },
    },
  }),
}))

vi.mock('db/database', () => ({
  db: {
    selectFrom: vi.fn().mockReturnValue({
      selectAll: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst }),
      }),
    }),
  },
}))

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
  loggingFetch: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  default: {
    knowledge: { sendInPrompt: false },
    chat: { autoSummary: { enable: false }, maxOutputTokens: undefined },
    provider: {},
    fileStorage: { location: '/tmp/test-storage' },
    dumpLlmConversation: false,
  },
}))

vi.mock('@/lib/satellite', () => ({ satelliteHub: { connections: [] } }))
vi.mock('@/backend/lib/tools/retrieve-file/implementation', () => ({}))

// --- business logic mocks ---

vi.mock('@/models/assistant', () => ({
  canUserAccessAssistant: mockCanUserAccessAssistant,
  getPublishedAssistantVersion: mockGetPublishedAssistantVersion,
  assistantVersionFiles: mockAssistantVersionFiles,
}))

vi.mock('@/backend/lib/tools/enumerate', () => ({
  availableToolsForAssistantVersion: mockAvailableToolsForAssistantVersion,
}))

vi.mock('@/lib/parameters', () => ({
  getUserParameters: mockGetUserParameters,
}))

vi.mock('@/lib/models', () => ({
  llmModels: [
    {
      id: 'test-model',
      model: 'gpt-4o-mini',
      name: 'Test Model',
      provider: 'openai',
      owned_by: 'openai',
      description: '',
      context_length: 128000,
      capabilities: { vision: false, function_calling: false, reasoning: false, knowledge: false },
    },
  ],
}))

// --- imports after mocks ---

import { SubAssistantTool } from '@/backend/lib/tools/subassistant/implementation'
import { ChatAssistant } from '@/backend/lib/chat'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolParams } from '@/lib/chat/tools'

// --- test fixtures ---

const fakeAssistantVersion = {
  id: 'version-1',
  model: 'test-model',
  systemPrompt: 'You are a test sub-assistant',
  temperature: 0.7,
  tokenLimit: 4096,
  reasoning_effort: null,
  backendId: 'backend-1',
}

const fakeBackend = {
  id: 'backend-1',
  providerType: 'openai',
  provisioned: false,
  configuration: JSON.stringify({ apiKey: 'sk-test' }),
}

const fakeLlmModel: LlmModel = {
  id: 'test-model',
  model: 'gpt-4o-mini',
  name: 'Test Model',
  provider: 'openai',
  owned_by: 'openai',
  description: '',
  context_length: 128000,
  capabilities: { vision: false, function_calling: false, reasoning: false, knowledge: false },
} as LlmModel

const fakeToolParams: ToolParams = {
  id: 'sub-assistant-tool',
  provisioned: false,
  promptFragment: '',
  name: 'Sub-assistant Tool',
}

const fakeUiLink = {
  debugMessage: vi.fn(),
  addCitations: vi.fn(),
  attachments: [],
  citations: [],
}

// --- helpers ---

/** Build a fake streamText result that emits the given text then finishes. */
function makeStreamResult(text: string) {
  return {
    fullStream: (async function* () {
      yield { type: 'start' }
      yield { type: 'start-step' }
      yield { type: 'text-start' }
      yield { type: 'text-delta', text }
      yield { type: 'text-end' }
      yield { type: 'finish-step' }
      yield { type: 'finish', totalUsage: { totalTokens: 10, inputTokens: 5, outputTokens: 5 } }
    })(),
  } as any
}

// --- tests ---

describe('SubAssistantTool.invoke_assistant', () => {
  let invoke: Function

  beforeEach(async () => {
    vi.clearAllMocks()

    // Prevent real LLM client construction; the model object itself is irrelevant
    // because ai.streamText is spied on per-test.
    vi.spyOn(ChatAssistant, 'createLanguageModel').mockReturnValue({ provider: 'openai', modelId: 'gpt-4o-mini' } as any)

    // Default: happy-path state
    mockCanUserAccessAssistant.mockResolvedValue(true)
    mockGetPublishedAssistantVersion.mockResolvedValue(fakeAssistantVersion)
    mockExecuteTakeFirst.mockResolvedValue(fakeBackend)

    const tool = new SubAssistantTool(fakeToolParams, [
      { id: 'asst-1', name: 'Sub Bot', description: 'A sub-assistant for testing' },
    ])
    const fns = await tool.functions(fakeLlmModel)
    invoke = (fns.invoke_assistant as any).invoke
  })

  test('returns text on successful invocation', async () => {
    mockStreamText.mockReturnValue(makeStreamResult('The answer is 4.'))

    const result = await invoke({
      llmModel: fakeLlmModel,
      messages: [],
      assistantId: 'parent',
      userId: 'user-1',
      params: { assistantId: 'asst-1', input: 'What is 2 + 2?' },
      uiLink: fakeUiLink,
    })

    expect(result).toEqual({ type: 'text', value: 'The answer is 4.' })
  })

  test('returns error-text when the LLM call throws', async () => {
    // Simulates an API-level failure (e.g. wrong model, network error).
    // invokeLlmAndProcessResponse catches this internally and records an ErrorPart
    // on the assistant message — our tool must surface that, not return empty text.
    mockStreamText.mockImplementation(() => {
      throw new Error('upstream API error')
    })

    const result = await invoke({
      llmModel: fakeLlmModel,
      messages: [],
      assistantId: 'parent',
      userId: 'user-1',
      params: { assistantId: 'asst-1', input: 'What is 2 + 2?' },
      uiLink: fakeUiLink,
    })

    expect(result.type).toBe('error-text')
    expect(typeof result.value).toBe('string')
    expect(result.value.length).toBeGreaterThan(0)
  })

  test('returns error-text when user has no access to the sub-assistant', async () => {
    mockCanUserAccessAssistant.mockResolvedValue(false)

    const result = await invoke({
      llmModel: fakeLlmModel,
      messages: [],
      assistantId: 'parent',
      userId: 'user-1',
      params: { assistantId: 'asst-1', input: 'hello' },
      uiLink: fakeUiLink,
    })

    expect(result).toEqual({
      type: 'error-text',
      value: 'Access to sub-assistant "Sub Bot" is denied',
    })
    expect(mockGetPublishedAssistantVersion).not.toHaveBeenCalled()
  })

  test('returns error-text when sub-assistant has no published version', async () => {
    mockGetPublishedAssistantVersion.mockResolvedValue(undefined)

    const result = await invoke({
      llmModel: fakeLlmModel,
      messages: [],
      assistantId: 'parent',
      userId: 'user-1',
      params: { assistantId: 'asst-1', input: 'hello' },
      uiLink: fakeUiLink,
    })

    expect(result).toEqual({
      type: 'error-text',
      value: 'Sub-assistant "Sub Bot" has no published version',
    })
  })

  test('returns error-text when backend is not found', async () => {
    mockExecuteTakeFirst.mockResolvedValue(undefined)

    const result = await invoke({
      llmModel: fakeLlmModel,
      messages: [],
      assistantId: 'parent',
      userId: 'user-1',
      params: { assistantId: 'asst-1', input: 'hello' },
      uiLink: fakeUiLink,
    })

    expect(result).toEqual({
      type: 'error-text',
      value: 'Sub-assistant "Sub Bot" backend not found',
    })
  })
})

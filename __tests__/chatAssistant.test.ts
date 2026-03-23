import { beforeEach, describe, expect, test, vi } from 'vitest'
import type * as dto from '@/types/dto'
import type { ToolFunction, ToolImplementation, ToolNative } from '@/lib/chat/tools'
import type { LlmModel } from '@/lib/chat/models'
import type { ClientSink } from '@/backend/lib/chat/ClientSink'

// ---- Module mocks (must be hoisted before imports) ----

const {
  mockCreateOpenAI,
  mockCreateAnthropic,
  mockCreateGoogleGenerativeAI,
  mockCreateVertex,
  mockCreatePerplexity,
  mockCreateLitellm,
  mockWrapLanguageModel,
  mockExtractReasoningMiddleware,
  mockGetBackends,
} = vi.hoisted(() => ({
  mockCreateOpenAI: vi.fn(),
  mockCreateAnthropic: vi.fn(),
  mockCreateGoogleGenerativeAI: vi.fn(),
  mockCreateVertex: vi.fn(),
  mockCreatePerplexity: vi.fn(),
  mockCreateLitellm: vi.fn(),
  mockWrapLanguageModel: vi.fn(),
  mockExtractReasoningMiddleware: vi.fn(),
  mockGetBackends: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: mockCreateAnthropic,
}))
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: mockCreateGoogleGenerativeAI,
}))
vi.mock('@ai-sdk/google-vertex', () => ({
  createVertex: mockCreateVertex,
}))
vi.mock('@ai-sdk/perplexity', () => ({
  createPerplexity: mockCreatePerplexity,
}))
vi.mock('@/lib/chat/litellm', () => ({
  createLitellm: mockCreateLitellm,
}))
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    wrapLanguageModel: mockWrapLanguageModel,
    extractReasoningMiddleware: mockExtractReasoningMiddleware,
  }
})
vi.mock('@/lib/env', () => ({
  default: {
    knowledge: { sendInPrompt: false },
    chat: { autoSummary: { enable: false, useChatBackend: false, maxLength: 500 }, maxOutputTokens: undefined },
    dumpLlmConversation: false,
    fileStorage: { encryptFiles: false },
  },
}))
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
  loggingFetch: undefined,
}))
vi.mock('@/lib/models', () => ({ llmModels: [] }))
vi.mock('@/lib/satellite/hub', () => ({ connections: [], callSatelliteMethod: vi.fn() }))
vi.mock('@/lib/storage', () => ({ storage: { writeBuffer: vi.fn() } }))
vi.mock('@/models/file', () => ({ addFile: vi.fn() }))
vi.mock('@/models/backend', () => ({ getBackends: mockGetBackends }))
vi.mock('@/models/user', () => ({}))
vi.mock('@/db/database', () => ({ db: {} }))
vi.mock('@/db/dialect', () => ({ createDialect: () => null }))
vi.mock('@/backend/lib/tools/knowledge/implementation', () => ({
  KnowledgePlugin: class KnowledgePlugin {
    toolParams = { name: 'knowledge', promptFragment: '' }
  },
}))

import { ChatAssistant, fillTemplate, ToolSetupError } from '@/backend/lib/chat'
import type { ProviderConfig } from '@/types/provider'
import { ChatState } from '@/backend/lib/chat/ChatState'

// ---- Helpers ----

const makeFakeLlmModel = (overrides: Partial<LlmModel> = {}): LlmModel =>
  ({
    id: 'test-model',
    model: 'test-model',
    name: 'Test Model',
    provider: 'openai',
    owned_by: 'openai',
    capabilities: { vision: false, supportedMedia: [], function_calling: true },
    ...overrides,
  }) as unknown as LlmModel

const makeToolImpl = (promptFragment = ''): ToolImplementation =>
  ({
    toolParams: { name: 'test-tool', promptFragment },
    functions: vi.fn().mockResolvedValue({}),
  }) as unknown as ToolImplementation

const makeChatAssistant = (overrides: Partial<InstanceType<typeof ChatAssistant>> = {}) => {
  const instance = Object.create(ChatAssistant.prototype) as ChatAssistant
  Object.assign(instance, {
    assistantParams: { assistantId: 'a1', model: 'gpt-4', systemPrompt: 'You are helpful', temperature: 0.7, tokenLimit: 1000, reasoning_effort: null },
    llmModel: makeFakeLlmModel(),
    tools: [],
    parameters: {},
    knowledge: [],
    options: { user: 'u1' },
    functions: Promise.resolve({}),
    debug: false,
    providerConfig: { providerType: 'openai' },
    languageModel: { provider: 'openai.responses' },
    llmModelCapabilities: { function_calling: true },
    saveMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })
  return instance
}

// Class-field arrow functions (computeSafeSummary, findReasonableSummarizationBackend) are
// instance-initialised, so they aren't on the prototype. We need a real constructed instance.
const makeRealAssistant = () => {
  vi.spyOn(ChatAssistant, 'createLanguageModel').mockReturnValue({ provider: 'openai.responses' } as any)
  vi.spyOn(ChatAssistant, 'computeFunctions').mockResolvedValue({} as any)
  return new ChatAssistant(
    { providerType: 'openai', apiKey: 'k', provisioned: false } as any,
    { assistantId: 'a1', model: 'gpt-4', systemPrompt: '', temperature: 0, tokenLimit: 1000, reasoning_effort: null },
    makeFakeLlmModel(),
    [],
    { user: 'u1' },
    {},
    []
  )
}

const makeUserMsg = (id = 'm1', conversationId = 'c1'): dto.UserMessage =>
  ({
    id,
    role: 'user',
    content: 'hello',
    attachments: [],
    parts: [],
    conversationId,
    sentAt: new Date().toISOString(),
    parent: null,
  }) as unknown as dto.UserMessage

// ============================================================
// fillTemplate
// ============================================================

describe('fillTemplate', () => {
  const params = {
    name: { value: 'Alice', defaultValue: 'Default', description: 'User name' },
    lang: { value: null, defaultValue: 'English', description: 'Language' },
    empty: { value: null, defaultValue: null, description: 'Empty param' },
  } as any

  test('substitutes a basic placeholder', () => {
    expect(fillTemplate('Hello {{ name }}', params)).toBe('Hello Alice')
  })

  test('falls back to defaultValue when value is null', () => {
    expect(fillTemplate('Lang: {{ lang }}', params)).toBe('Lang: English')
  })

  test('keeps placeholder when key not in params', () => {
    expect(fillTemplate('{{ missing }}', params)).toBe('{{ missing }}')
  })

  test('keeps placeholder when both value and defaultValue are null', () => {
    expect(fillTemplate('{{ empty }}', params)).toBe('{{ empty }}')
  })

  test('substitutes .description subkey', () => {
    expect(fillTemplate('{{ name.description }}', params)).toBe('User name')
  })

  test('keeps placeholder for unknown subkey', () => {
    expect(fillTemplate('{{ name.unknown }}', params)).toBe('{{ name.unknown }}')
  })

  test('handles spaces around key name', () => {
    expect(fillTemplate('{{  name  }}', params)).toBe('Alice')
  })

  test('replaces multiple placeholders', () => {
    expect(fillTemplate('{{ name }} speaks {{ lang }}', params)).toBe('Alice speaks English')
  })

  test('returns template unchanged when no placeholders', () => {
    expect(fillTemplate('No placeholders here', params)).toBe('No placeholders here')
  })
})

// ============================================================
// ToolSetupError
// ============================================================

describe('ToolSetupError', () => {
  test('has correct name', () => {
    expect(new ToolSetupError('my-tool').name).toBe('ToolSetupError')
  })

  test('stores toolName', () => {
    expect(new ToolSetupError('my-tool').toolName).toBe('my-tool')
  })

  test('uses default message when none provided', () => {
    expect(new ToolSetupError('my-tool').message).toContain('my-tool')
  })

  test('uses custom message when provided', () => {
    expect(new ToolSetupError('my-tool', 'Custom error').message).toBe('Custom error')
  })

  test('is an instance of Error', () => {
    expect(new ToolSetupError('my-tool')).toBeInstanceOf(Error)
  })
})

// ============================================================
// ChatAssistant.assistantParamsFrom
// ============================================================

describe('ChatAssistant.assistantParamsFrom', () => {
  const base = {
    model: 'gpt-4',
    systemPrompt: 'Be helpful',
    temperature: 0.5,
    tokenLimit: 2000,
    reasoning_effort: null as null,
  }

  test('maps all required fields', () => {
    const params = ChatAssistant.assistantParamsFrom({ ...base, assistantId: 'a1' })
    expect(params.model).toBe('gpt-4')
    expect(params.systemPrompt).toBe('Be helpful')
    expect(params.temperature).toBe(0.5)
    expect(params.tokenLimit).toBe(2000)
    expect(params.reasoning_effort).toBeNull()
  })

  test('uses assistantId when provided', () => {
    const params = ChatAssistant.assistantParamsFrom({ ...base, assistantId: 'explicit-id' })
    expect(params.assistantId).toBe('explicit-id')
  })

  test('falls back to id when assistantId absent', () => {
    const params = ChatAssistant.assistantParamsFrom({ ...base, id: 'fallback-id' })
    expect(params.assistantId).toBe('fallback-id')
  })

  test('uses empty string when both assistantId and id are absent', () => {
    const params = ChatAssistant.assistantParamsFrom(base)
    expect(params.assistantId).toBe('')
  })
})

// ============================================================
// ChatAssistant.withBuiltinTools
// ============================================================

describe('ChatAssistant.withBuiltinTools', () => {
  test('appends KnowledgePlugin when knowledge capability is not false', () => {
    const tools = [makeToolImpl()]
    const model = makeFakeLlmModel({ capabilities: { knowledge: true } } as any)
    const result = ChatAssistant.withBuiltinTools(tools, model)
    expect(result).toHaveLength(2)
  })

  test('does not append KnowledgePlugin when knowledge=false', () => {
    const tools = [makeToolImpl()]
    const model = makeFakeLlmModel({ capabilities: { knowledge: false } } as any)
    const result = ChatAssistant.withBuiltinTools(tools, model)
    expect(result).toHaveLength(1)
  })

  test('defaults to adding KnowledgePlugin when knowledge capability is undefined', () => {
    const tools: ToolImplementation[] = []
    const model = makeFakeLlmModel({ capabilities: {} } as any)
    const result = ChatAssistant.withBuiltinTools(tools, model)
    expect(result).toHaveLength(1)
  })
})

// ============================================================
// ChatAssistant.computeSystemPrompt
// ============================================================

describe('ChatAssistant.computeSystemPrompt', () => {
  test('returns system role message', async () => {
    const result = await ChatAssistant.computeSystemPrompt(
      { assistantId: 'a1', model: 'gpt-4', systemPrompt: 'Be helpful', temperature: 0, tokenLimit: 1000, reasoning_effort: null },
      [],
      {}
    )
    expect(result.role).toBe('system')
  })

  test('includes system prompt in content', async () => {
    const result = await ChatAssistant.computeSystemPrompt(
      { assistantId: 'a1', model: 'gpt-4', systemPrompt: 'Custom prompt', temperature: 0, tokenLimit: 1000, reasoning_effort: null },
      [],
      {}
    )
    expect(result.content).toContain('Custom prompt')
  })

  test('concatenates tool prompt fragments', async () => {
    const tools = [makeToolImpl('tool-fragment-here')]
    const result = await ChatAssistant.computeSystemPrompt(
      { assistantId: 'a1', model: 'gpt-4', systemPrompt: 'Base', temperature: 0, tokenLimit: 1000, reasoning_effort: null },
      tools,
      {}
    )
    expect(result.content).toContain('tool-fragment-here')
  })

  test('applies template substitution from parameters', async () => {
    const result = await ChatAssistant.computeSystemPrompt(
      { assistantId: 'a1', model: 'gpt-4', systemPrompt: 'Hello {{ user }}', temperature: 0, tokenLimit: 1000, reasoning_effort: null },
      [],
      { user: { value: 'Alice', defaultValue: '', description: 'user' } } as any
    )
    expect(result.content).toContain('Hello Alice')
  })
})

// ============================================================
// ChatAssistant.createLanguageModelBasic
// ============================================================

describe('ChatAssistant.createLanguageModelBasic', () => {
  const fakeModel = makeFakeLlmModel({ model: 'gpt-4o' })

  beforeEach(() => {
    vi.clearAllMocks()
    const makeModel = (name: string) => ({ provider: name })
    const makeProvider = (modelFn: string) => (model: string) => makeModel(model)
    mockCreateOpenAI.mockReturnValue({ responses: makeProvider('openai') })
    mockCreateAnthropic.mockReturnValue({ languageModel: makeProvider('anthropic') })
    mockCreateGoogleGenerativeAI.mockReturnValue({ languageModel: makeProvider('gemini') })
    mockCreatePerplexity.mockReturnValue({ languageModel: makeProvider('perplexity') })
    mockCreateLitellm.mockReturnValue({ languageModel: makeProvider('litellm') })
    mockCreateVertex.mockReturnValue({ languageModel: makeProvider('vertex') })
  })

  test('creates OpenAI model', () => {
    const config: ProviderConfig = { providerType: 'openai', apiKey: 'key', provisioned: false } as any
    ChatAssistant.createLanguageModelBasic(config, fakeModel)
    expect(mockCreateOpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'key' }))
  })

  test('creates Anthropic model', () => {
    const config: ProviderConfig = { providerType: 'anthropic', apiKey: 'key', provisioned: false } as any
    ChatAssistant.createLanguageModelBasic(config, fakeModel)
    expect(mockCreateAnthropic).toHaveBeenCalled()
  })

  test('creates Perplexity model', () => {
    const config: ProviderConfig = { providerType: 'perplexity', apiKey: 'key', provisioned: false } as any
    ChatAssistant.createLanguageModelBasic(config, fakeModel)
    expect(mockCreatePerplexity).toHaveBeenCalled()
  })

  test('creates Gemini model', () => {
    const config: ProviderConfig = { providerType: 'gemini', apiKey: 'key', provisioned: false } as any
    ChatAssistant.createLanguageModelBasic(config, fakeModel)
    expect(mockCreateGoogleGenerativeAI).toHaveBeenCalled()
  })

  test('creates Vertex model', () => {
    const config: ProviderConfig = {
      providerType: 'gcp-vertex',
      credentials: JSON.stringify({ project_id: 'my-project' }),
      provisioned: false,
    } as any
    ChatAssistant.createLanguageModelBasic(config, fakeModel)
    expect(mockCreateVertex).toHaveBeenCalledWith(expect.objectContaining({ project: 'my-project' }))
  })

  test('throws for invalid Vertex credentials JSON', () => {
    const config: ProviderConfig = { providerType: 'gcp-vertex', credentials: 'not-json', provisioned: false } as any
    expect(() => ChatAssistant.createLanguageModelBasic(config, fakeModel)).toThrow('Invalid gcp configuration')
  })

  test('throws for unknown provider type', () => {
    const config = { providerType: 'unknown-provider' } as any
    expect(() => ChatAssistant.createLanguageModelBasic(config, fakeModel)).toThrow('Unknown provider type')
  })

  test('creates logiclecloud + openai-owned model using OpenAI responses', () => {
    const config: ProviderConfig = { providerType: 'logiclecloud', apiKey: 'key', endPoint: 'http://llm', provisioned: false } as any
    const model = makeFakeLlmModel({ model: 'gpt-4o', owned_by: 'openai' })
    ChatAssistant.createLanguageModelBasic(config, model)
    expect(mockCreateOpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'http://llm' }))
  })

  test('creates logiclecloud + anthropic-owned model using Anthropic', () => {
    const config: ProviderConfig = { providerType: 'logiclecloud', apiKey: 'key', endPoint: 'http://llm', provisioned: false } as any
    const model = makeFakeLlmModel({ model: 'claude-3', owned_by: 'anthropic' })
    ChatAssistant.createLanguageModelBasic(config, model)
    expect(mockCreateAnthropic).toHaveBeenCalled()
  })

  test('creates logiclecloud + gemini-owned model using Google', () => {
    const config: ProviderConfig = { providerType: 'logiclecloud', apiKey: 'key', endPoint: 'http://llm', provisioned: false } as any
    const model = makeFakeLlmModel({ model: 'gemini-pro', owned_by: 'gemini' })
    ChatAssistant.createLanguageModelBasic(config, model)
    expect(mockCreateGoogleGenerativeAI).toHaveBeenCalled()
  })

  test('creates logiclecloud + other model using LiteLLM', () => {
    const config: ProviderConfig = { providerType: 'logiclecloud', apiKey: 'key', endPoint: 'http://llm', provisioned: false } as any
    const model = makeFakeLlmModel({ model: 'some-model', owned_by: 'other' })
    ChatAssistant.createLanguageModelBasic(config, model)
    expect(mockCreateLitellm).toHaveBeenCalled()
  })
})

// ============================================================
// ChatAssistant.createLanguageModel — perplexity wrapping
// ============================================================

describe('ChatAssistant.createLanguageModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreatePerplexity.mockReturnValue({ languageModel: () => ({ provider: 'perplexity' }) })
    mockCreateOpenAI.mockReturnValue({ responses: () => ({ provider: 'openai.responses' }) })
    mockWrapLanguageModel.mockReturnValue({ provider: 'wrapped' })
    mockExtractReasoningMiddleware.mockReturnValue({})
  })

  test('wraps perplexity model with reasoning middleware', () => {
    const config: ProviderConfig = { providerType: 'perplexity', apiKey: 'key', provisioned: false } as any
    const model = makeFakeLlmModel({ owned_by: 'perplexity' })
    ChatAssistant.createLanguageModel(config, model)
    expect(mockWrapLanguageModel).toHaveBeenCalledWith(
      expect.objectContaining({ middleware: expect.anything() })
    )
  })

  test('does not wrap non-perplexity models', () => {
    const config: ProviderConfig = { providerType: 'openai', apiKey: 'key', provisioned: false } as any
    const model = makeFakeLlmModel({ owned_by: 'openai' })
    ChatAssistant.createLanguageModel(config, model)
    expect(mockWrapLanguageModel).not.toHaveBeenCalled()
  })
})

// ============================================================
// ChatAssistant.createAiTools
// ============================================================

describe('ChatAssistant.createAiTools', () => {
  test('returns undefined when there are no functions', async () => {
    const assistant = makeChatAssistant({ functions: Promise.resolve({}) })
    const tools = await assistant.createAiTools()
    expect(tools).toBeUndefined()
  })

  test('maps a regular ToolFunction to an ai.Tool with description and inputSchema', async () => {
    const fn: ToolFunction = {
      description: 'Does stuff',
      parameters: { type: 'object', properties: {}, required: [] } as any,
      invoke: vi.fn(),
    }
    const assistant = makeChatAssistant({ functions: Promise.resolve({ myTool: fn }) })
    const tools = await assistant.createAiTools()
    expect(tools).toBeDefined()
    expect(tools!.myTool).toMatchObject({ description: 'Does stuff' })
    expect(tools!.myTool.inputSchema).toBeDefined()
  })

  test('maps a ToolNative (provider type) to an ai.Tool with type=provider', async () => {
    const fn: ToolNative = {
      type: 'provider',
      id: 'web_search_preview',
      args: {},
    }
    const assistant = makeChatAssistant({ functions: Promise.resolve({ webSearch: fn }) })
    const tools = await assistant.createAiTools()
    expect(tools!.webSearch).toMatchObject({ type: 'provider', id: 'web_search_preview' })
  })

  test('maps ToolFunction with undefined parameters to z.any() schema', async () => {
    const fn: ToolFunction = { description: 'No schema', invoke: vi.fn() }
    const assistant = makeChatAssistant({ functions: Promise.resolve({ noSchema: fn }) })
    const tools = await assistant.createAiTools()
    expect(tools!.noSchema.inputSchema).toBeDefined()
  })
})

// ============================================================
// ChatAssistant.invokeFunctionByName
// ============================================================

describe('ChatAssistant.invokeFunctionByName', () => {
  const makeUserResponse = (allow: boolean): dto.UserResponse =>
    ({ id: 'r1', role: 'user-response', allow, conversationId: 'c1', sentAt: '', parent: 'm1', attachments: [], content: '' }) as any

  const makeToolCall = (name = 'myTool'): dto.ToolCall =>
    ({ toolCallId: 'tc1', toolName: name, args: {} }) as any

  test('returns error when function not found', async () => {
    const assistant = makeChatAssistant({ functions: Promise.resolve({}) })
    const chatState = { chatHistory: [makeUserMsg()] } as any
    const result = await assistant.invokeFunctionByName(makeToolCall('unknown'), makeUserResponse(true), chatState, {} as any)
    expect(result.type).toBe('error-text')
  })

  test('returns error when user denied', async () => {
    const fn: ToolFunction = { description: 'Test', invoke: vi.fn() }
    const assistant = makeChatAssistant({ functions: Promise.resolve({ myTool: fn }) })
    const chatState = { chatHistory: [makeUserMsg()] } as any
    const result = await assistant.invokeFunctionByName(makeToolCall(), makeUserResponse(false), chatState, {} as any)
    expect(result.type).toBe('error-text')
    expect((result as dto.ToolCallErrorText).value).toContain('denied')
  })

  test('returns error for provider-type tool', async () => {
    const fn: ToolNative = { type: 'provider', id: 'web_search', args: {} }
    const assistant = makeChatAssistant({ functions: Promise.resolve({ myTool: fn }) })
    const chatState = { chatHistory: [makeUserMsg()] } as any
    const result = await assistant.invokeFunctionByName(makeToolCall(), makeUserResponse(true), chatState, {} as any)
    expect(result.type).toBe('error-text')
    expect((result as dto.ToolCallErrorText).value).toContain('provider')
  })

  test('invokes function when found and allowed', async () => {
    const invokeResult: dto.ToolCallResultOutput = { type: 'content', value: [{ type: 'text', text: 'ok' }] }
    const fn: ToolFunction = { description: 'Test', invoke: vi.fn().mockResolvedValue(invokeResult) }
    const assistant = makeChatAssistant({ functions: Promise.resolve({ myTool: fn }) })
    const chatState = { chatHistory: [makeUserMsg()], conversationId: 'c1' } as any
    const result = await assistant.invokeFunctionByName(makeToolCall(), makeUserResponse(true), chatState, { attachments: [] } as any)
    expect(result).toEqual(invokeResult)
    expect(fn.invoke).toHaveBeenCalled()
  })
})

// ============================================================
// ChatAssistant.invokeFunction
// ============================================================

describe('ChatAssistant.invokeFunction', () => {
  const makeToolCall = (): dto.ToolCall => ({ toolCallId: 'tc1', toolName: 'myTool', args: { x: 1 } }) as any

  test('calls func.invoke with the right params', async () => {
    const invokeResult: dto.ToolCallResultOutput = { type: 'content', value: [] }
    const fn: ToolFunction = { description: 'Test', invoke: vi.fn().mockResolvedValue(invokeResult) }
    const assistant = makeChatAssistant()
    const chatState = { chatHistory: [makeUserMsg()], conversationId: 'c1' } as any
    const toolUILink = { attachments: [] } as any

    const result = await assistant.invokeFunction(makeToolCall(), fn, chatState, toolUILink)

    expect(result).toEqual(invokeResult)
    expect(fn.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ params: { x: 1 }, toolName: 'myTool', toolCallId: 'tc1' })
    )
  })

  test('returns error-text when func.invoke throws', async () => {
    const fn: ToolFunction = { description: 'Test', invoke: vi.fn().mockRejectedValue(new Error('boom')) }
    const assistant = makeChatAssistant()
    const chatState = { chatHistory: [makeUserMsg()], conversationId: 'c1' } as any
    const toolUILink = { attachments: [] } as any

    const result = await assistant.invokeFunction(makeToolCall(), fn, chatState, toolUILink)

    expect(result.type).toBe('error-text')
    expect((result as dto.ToolCallErrorText).value).toContain('boom')
  })
})

// ============================================================
// ChatAssistant.computeSafeSummary
// ============================================================

describe('ChatAssistant.computeSafeSummary', () => {
  // Class-field arrow function — needs a real constructed instance
  let assistant: ChatAssistant
  beforeEach(() => { assistant = makeRealAssistant() })

  test('returns short text unchanged', async () => {
    expect(await assistant.computeSafeSummary('hello')).toBe('hello')
  })

  test('truncates at 128 chars with ellipsis', async () => {
    const long = 'a'.repeat(200)
    const result = await assistant.computeSafeSummary(long)
    expect(result).toHaveLength(131) // 128 + '...'
    expect(result.endsWith('...')).toBe(true)
  })

  test('stops at first newline', async () => {
    const result = await assistant.computeSafeSummary('first line\nsecond line')
    expect(result).toBe('first line')
  })

  test('stops at newline before truncation', async () => {
    const result = await assistant.computeSafeSummary('short\n' + 'a'.repeat(200))
    expect(result).toBe('short')
  })
})

// ============================================================
// ChatAssistant.findReasonableSummarizationBackend
// ============================================================

describe('ChatAssistant.findReasonableSummarizationBackend', () => {
  // Class-field arrow function — needs a real constructed instance
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateOpenAI.mockReturnValue({ responses: () => ({ provider: 'openai.responses' }) })
  })

  test('returns undefined when useChatBackend=true', async () => {
    const env = await import('@/lib/env')
    ;(env.default as any).chat.autoSummary.useChatBackend = true
    const assistant = makeRealAssistant()
    const result = await assistant.findReasonableSummarizationBackend()
    expect(result).toBeUndefined()
    ;(env.default as any).chat.autoSummary.useChatBackend = false
  })

  test('returns undefined when no backends exist', async () => {
    mockGetBackends.mockResolvedValue([])
    const assistant = makeRealAssistant()
    const result = await assistant.findReasonableSummarizationBackend()
    expect(result).toBeUndefined()
  })

  test('returns undefined when no models match the best backend provider', async () => {
    mockGetBackends.mockResolvedValue([{ providerType: 'openai', apiKey: 'k', provisioned: false }])
    const { llmModels } = await import('@/lib/models')
    ;(llmModels as any[]).splice(0) // clear all models

    const assistant = makeRealAssistant()
    const result = await assistant.findReasonableSummarizationBackend()
    expect(result).toBeUndefined()
  })
})

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ChatAssistant, type AssistantParams } from '@/backend/lib/chat/index'
import { ChatState } from '@/backend/lib/chat/ChatState'
import type * as dto from '@/types/dto'
import type { ToolFunction } from '@/lib/chat/tools'
import type { ClientSink } from '@/backend/lib/chat/ClientSink'

// ---- Module mocks ----

let disableParallelToolCalls = false

vi.mock('@/lib/env', () => ({
  default: {
    chat: {
      // mirrors env.ts: disableParallelToolCalls = ENABLE_PARALLEL_TOOL_CALLS === '0'
      get disableParallelToolCalls() {
        return disableParallelToolCalls
      },
      maxOutputTokens: undefined,
      autoSummary: { enable: false },
    },
    dumpLlmConversation: false,
    fileStorage: { encryptFiles: false },
  },
}))

vi.mock('@/lib/satelliteHub', () => ({
  connections: [],
  callSatelliteMethod: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  storage: { writeBuffer: vi.fn() },
}))

vi.mock('@/models/file', () => ({
  addFile: vi.fn(),
}))

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
  loggingFetch: vi.fn(),
}))

vi.mock('@/lib/models', () => ({
  llmModels: [],
}))

vi.mock('@/models/user', () => ({}))

vi.mock('@/models/fileAnalysis', () => ({}))

vi.mock('@/lib/file-analysis', () => ({
  ensureFileAnalysis: vi.fn(),
  isReadyFileAnalysis: vi.fn(),
}))

vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: { extractFromFile: vi.fn() },
}))

vi.mock('@/backend/lib/tools/knowledge/implementation', () => ({
  KnowledgePlugin: class {},
}))

vi.mock('@/backend/lib/chat/prompt-token-counter', () => ({
  countPromptSegmentsTokens: vi.fn().mockResolvedValue({ assistant: 0, history: 0, draft: 0 }),
}))

// ---- Helpers ----

/** Creates an async iterable stream from a list of chunks. */
function makeStream(chunks: any[]) {
  return {
    fullStream: (async function* () {
      for (const chunk of chunks) yield chunk
    })(),
  }
}

/** Two tool-call chunks followed by a finish. */
function twoToolCallChunks() {
  return [
    { type: 'tool-call', toolCallId: 'tc1', toolName: 'tool1', input: { q: 'hello' }, providerExecuted: false },
    { type: 'tool-call', toolCallId: 'tc2', toolName: 'tool2', input: { q: 'world' }, providerExecuted: false },
    { type: 'finish', totalUsage: { totalTokens: 10, inputTokens: 5 } },
  ]
}

/** Minimal "nothing more to do" stream. */
function finishStream() {
  return [{ type: 'finish', totalUsage: { totalTokens: 5, inputTokens: 3 } }]
}

class MockClientSink implements ClientSink {
  events: dto.TextStreamPart[] = []
  enqueue(event: dto.TextStreamPart) {
    this.events.push(event)
  }
}

function makeTool(invoke: ToolFunction['invoke'], extra: Partial<ToolFunction> = {}): ToolFunction {
  return { description: 'test tool', invoke, ...extra }
}

function makeAssistant(tools: Record<string, ToolFunction>) {
  vi.spyOn(ChatAssistant, 'createLanguageModel').mockReturnValue({ provider: 'openai.chat' } as any)
  vi.spyOn(ChatAssistant, 'computeFunctions').mockResolvedValue(tools)

  const assistantParams: AssistantParams = {
    model: 'gpt-4',
    assistantId: 'asst-1',
    systemPrompt: '',
    temperature: 0,
    tokenLimit: 4096,
    reasoning_effort: null,
  }
  const llmModel = {
    id: 'gpt-4',
    maxOutputTokens: undefined,
    capabilities: { function_calling: true, vision: false, reasoning: false, supportedMedia: [] },
  } as any

  return new ChatAssistant(
    { providerType: 'openai.chat' } as any,
    assistantParams,
    llmModel,
    [],
    {},
    {},
    []
  )
}

function makeUserChatState(): ChatState {
  const userMsg: dto.UserMessage = {
    id: 'user-1',
    role: 'user',
    conversationId: 'conv-1',
    parent: null,
    sentAt: new Date().toISOString(),
    content: 'hello',
    attachments: [],
  }
  return new ChatState([userMsg])
}

// ---- Tests: parallel tool execution ----

describe('parallel tool execution', () => {
  beforeEach(() => {
    disableParallelToolCalls = false
    vi.clearAllMocks()
  })

  test('invokes both tools when LLM returns two tool calls', async () => {
    const invoke1 = vi.fn().mockResolvedValue({ type: 'text', value: 'r1' } as dto.ToolCallResultOutput)
    const invoke2 = vi.fn().mockResolvedValue({ type: 'text', value: 'r2' } as dto.ToolCallResultOutput)
    const assistant = makeAssistant({ tool1: makeTool(invoke1), tool2: makeTool(invoke2) })
    const invokeLlmSpy = vi.spyOn(assistant as any, 'invokeLlm')
    invokeLlmSpy.mockResolvedValueOnce(makeStream(twoToolCallChunks()))
    invokeLlmSpy.mockResolvedValueOnce(makeStream(finishStream()))

    await (assistant as any).invokeLlmAndProcessResponse(makeUserChatState(), new MockClientSink())

    expect(invoke1).toHaveBeenCalledOnce()
    expect(invoke2).toHaveBeenCalledOnce()
  })

  test('both tool-result parts appear in SSE events', async () => {
    const invoke1 = vi.fn().mockResolvedValue({ type: 'text', value: 'r1' } as dto.ToolCallResultOutput)
    const invoke2 = vi.fn().mockResolvedValue({ type: 'text', value: 'r2' } as dto.ToolCallResultOutput)
    const assistant = makeAssistant({ tool1: makeTool(invoke1), tool2: makeTool(invoke2) })
    const invokeLlmSpy = vi.spyOn(assistant as any, 'invokeLlm')
    invokeLlmSpy.mockResolvedValueOnce(makeStream(twoToolCallChunks()))
    invokeLlmSpy.mockResolvedValueOnce(makeStream(finishStream()))

    const sink = new MockClientSink()
    await (assistant as any).invokeLlmAndProcessResponse(makeUserChatState(), sink)

    const resultParts = sink.events
      .filter((e): e is Extract<dto.TextStreamPart, { type: 'part' }> => e.type === 'part')
      .map((e) => e.part)
      .filter((p): p is dto.ToolCallResultPart => p.type === 'tool-result')

    expect(resultParts).toHaveLength(2)
    expect(resultParts.map((p) => p.toolCallId)).toEqual(expect.arrayContaining(['tc1', 'tc2']))
    expect(resultParts.map((p) => p.toolName)).toEqual(expect.arrayContaining(['tool1', 'tool2']))
  })

  test('both results are stored in a single tool message', async () => {
    const invoke1 = vi.fn().mockResolvedValue({ type: 'text', value: 'r1' } as dto.ToolCallResultOutput)
    const invoke2 = vi.fn().mockResolvedValue({ type: 'text', value: 'r2' } as dto.ToolCallResultOutput)
    const assistant = makeAssistant({ tool1: makeTool(invoke1), tool2: makeTool(invoke2) })
    const invokeLlmSpy = vi.spyOn(assistant as any, 'invokeLlm')
    invokeLlmSpy.mockResolvedValueOnce(makeStream(twoToolCallChunks()))
    invokeLlmSpy.mockResolvedValueOnce(makeStream(finishStream()))

    const chatState = makeUserChatState()
    await (assistant as any).invokeLlmAndProcessResponse(chatState, new MockClientSink())

    const toolMessages = chatState.chatHistory.filter(
      (m): m is dto.ToolMessage => m.role === 'tool'
    )
    expect(toolMessages).toHaveLength(1)
    const toolParts = toolMessages[0].parts.filter((p) => p.type === 'tool-result')
    expect(toolParts).toHaveLength(2)
  })

  test('tool2 starts before tool1 finishes (concurrent execution)', async () => {
    let tool1Running = false
    let tool2StartedWhileTool1Running = false

    const invoke1 = vi.fn().mockImplementation(async () => {
      tool1Running = true
      await new Promise<void>((r) => setTimeout(r, 50))
      tool1Running = false
      return { type: 'text', value: 'r1' } as dto.ToolCallResultOutput
    })
    const invoke2 = vi.fn().mockImplementation(async () => {
      // If tool1 is still running, they are concurrent
      tool2StartedWhileTool1Running = tool1Running
      return { type: 'text', value: 'r2' } as dto.ToolCallResultOutput
    })

    const assistant = makeAssistant({ tool1: makeTool(invoke1), tool2: makeTool(invoke2) })
    const invokeLlmSpy = vi.spyOn(assistant as any, 'invokeLlm')
    invokeLlmSpy.mockResolvedValueOnce(makeStream(twoToolCallChunks()))
    invokeLlmSpy.mockResolvedValueOnce(makeStream(finishStream()))

    await (assistant as any).invokeLlmAndProcessResponse(makeUserChatState(), new MockClientSink())

    expect(tool2StartedWhileTool1Running).toBe(true)
  })
})

// ---- Tests: auth/confirm interrupts ----

describe('auth and requireConfirm interrupts', () => {
  beforeEach(() => {
    disableParallelToolCalls = false
    vi.clearAllMocks()
  })

  test('pauses execution when first tool requires auth', async () => {
    const authRequest: dto.UserRequest = {
      type: 'tool-call-authorization',
      toolCallId: 'tc1',
      toolName: 'tool1',
      args: {},
    }
    const invoke1 = vi.fn()
    const invoke2 = vi.fn()
    const assistant = makeAssistant({
      tool1: makeTool(invoke1, { auth: async () => authRequest }),
      tool2: makeTool(invoke2),
    })
    const invokeLlmSpy = vi.spyOn(assistant as any, 'invokeLlm')
    invokeLlmSpy.mockResolvedValueOnce(makeStream(twoToolCallChunks()))

    const chatState = makeUserChatState()
    await (assistant as any).invokeLlmAndProcessResponse(chatState, new MockClientSink())

    // Neither tool should have been executed
    expect(invoke1).not.toHaveBeenCalled()
    expect(invoke2).not.toHaveBeenCalled()

    // A user-request message should be in the history
    const userRequestMessages = chatState.chatHistory.filter((m) => m.role === 'user-request')
    expect(userRequestMessages).toHaveLength(1)
  })

  test('pauses execution when second tool requires auth, first tool not executed', async () => {
    const invoke1 = vi.fn()
    const invoke2 = vi.fn()
    const authRequest: dto.UserRequest = {
      type: 'tool-call-authorization',
      toolCallId: 'tc2',
      toolName: 'tool2',
      args: {},
    }
    const assistant = makeAssistant({
      tool1: makeTool(invoke1),
      tool2: makeTool(invoke2, { auth: async () => authRequest }),
    })
    const invokeLlmSpy = vi.spyOn(assistant as any, 'invokeLlm')
    invokeLlmSpy.mockResolvedValueOnce(makeStream(twoToolCallChunks()))

    const chatState = makeUserChatState()
    await (assistant as any).invokeLlmAndProcessResponse(chatState, new MockClientSink())

    expect(invoke1).not.toHaveBeenCalled()
    expect(invoke2).not.toHaveBeenCalled()

    const userRequestMessages = chatState.chatHistory.filter((m) => m.role === 'user-request')
    expect(userRequestMessages).toHaveLength(1)
  })

  test('pauses execution when tool requires confirmation', async () => {
    const invoke1 = vi.fn()
    const invoke2 = vi.fn()
    const assistant = makeAssistant({
      tool1: makeTool(invoke1),
      tool2: makeTool(invoke2, { requireConfirm: true }),
    })
    const invokeLlmSpy = vi.spyOn(assistant as any, 'invokeLlm')
    invokeLlmSpy.mockResolvedValueOnce(makeStream(twoToolCallChunks()))

    const chatState = makeUserChatState()
    const sink = new MockClientSink()
    await (assistant as any).invokeLlmAndProcessResponse(chatState, sink)

    expect(invoke1).not.toHaveBeenCalled()
    expect(invoke2).not.toHaveBeenCalled()

    const userRequestMessages = chatState.chatHistory.filter((m) => m.role === 'user-request')
    expect(userRequestMessages).toHaveLength(1)
    const request = (userRequestMessages[0] as dto.UserRequestMessage).request
    expect(request.type).toBe('tool-call-authorization-multiple')
    const authReq = request as dto.ToolCallAuthorizationRequestMultiple
    // Both tool calls should be batched into a single authorization request
    expect(authReq.toolCalls).toHaveLength(2)
    expect(authReq.toolCalls.some((tc) => tc.toolCallId === 'tc1')).toBe(true)
    expect(authReq.toolCalls.some((tc) => tc.toolCallId === 'tc2')).toBe(true)
  })

  test('auth returning null does not interrupt execution', async () => {
    const invoke1 = vi.fn().mockResolvedValue({ type: 'text', value: 'r1' } as dto.ToolCallResultOutput)
    const invoke2 = vi.fn().mockResolvedValue({ type: 'text', value: 'r2' } as dto.ToolCallResultOutput)
    const assistant = makeAssistant({
      tool1: makeTool(invoke1, { auth: async () => null }),
      tool2: makeTool(invoke2, { auth: async () => null }),
    })
    const invokeLlmSpy = vi.spyOn(assistant as any, 'invokeLlm')
    invokeLlmSpy.mockResolvedValueOnce(makeStream(twoToolCallChunks()))
    invokeLlmSpy.mockResolvedValueOnce(makeStream(finishStream()))

    const chatState = makeUserChatState()
    await (assistant as any).invokeLlmAndProcessResponse(chatState, new MockClientSink())

    expect(invoke1).toHaveBeenCalledOnce()
    expect(invoke2).toHaveBeenCalledOnce()

    const userRequestMessages = chatState.chatHistory.filter((m) => m.role === 'user-request')
    expect(userRequestMessages).toHaveLength(0)
  })
})

// ---- Tests: provider options (advertising parallel support to the LLM) ----

describe('providerOptions: ENABLE_PARALLEL_TOOL_CALLS controls what is advertised to the LLM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('openai.responses does not set parallelToolCalls when parallel is enabled', () => {
    disableParallelToolCalls = false
    vi.spyOn(ChatAssistant, 'createLanguageModel').mockReturnValue({
      provider: 'openai.responses',
    } as any)
    vi.spyOn(ChatAssistant, 'computeFunctions').mockResolvedValue({})

    const assistant = makeAssistant({})
    ;(assistant as any).languageModel = { provider: 'openai.responses' }

    const opts = (assistant as any).providerOptions([]) as Record<string, any>
    expect(opts?.openai?.parallelToolCalls).toBeUndefined()
  })

  test('openai.responses sets parallelToolCalls: false when parallel is disabled', () => {
    disableParallelToolCalls = true
    vi.spyOn(ChatAssistant, 'createLanguageModel').mockReturnValue({
      provider: 'openai.responses',
    } as any)
    vi.spyOn(ChatAssistant, 'computeFunctions').mockResolvedValue({})

    const assistant = makeAssistant({})
    ;(assistant as any).languageModel = { provider: 'openai.responses' }

    const opts = (assistant as any).providerOptions([]) as Record<string, any>
    expect(opts?.openai?.parallelToolCalls).toBe(false)
  })

  test('anthropic.messages does not set disableParallelToolUse when parallel is enabled', () => {
    disableParallelToolCalls = false
    vi.spyOn(ChatAssistant, 'createLanguageModel').mockReturnValue({
      provider: 'anthropic.messages',
    } as any)
    vi.spyOn(ChatAssistant, 'computeFunctions').mockResolvedValue({})

    const assistant = makeAssistant({})
    ;(assistant as any).languageModel = { provider: 'anthropic.messages' }
    ;(assistant as any).tools = []

    const opts = (assistant as any).providerOptions([]) as Record<string, any>
    expect(opts?.anthropic?.disableParallelToolUse).toBeUndefined()
  })

  test('anthropic.messages sets disableParallelToolUse: true when parallel is disabled', () => {
    disableParallelToolCalls = true
    vi.spyOn(ChatAssistant, 'createLanguageModel').mockReturnValue({
      provider: 'anthropic.messages',
    } as any)
    vi.spyOn(ChatAssistant, 'computeFunctions').mockResolvedValue({})

    const assistant = makeAssistant({})
    ;(assistant as any).languageModel = { provider: 'anthropic.messages' }
    ;(assistant as any).tools = []

    const opts = (assistant as any).providerOptions([]) as Record<string, any>
    expect(opts?.anthropic?.disableParallelToolUse).toBe(true)
  })
})

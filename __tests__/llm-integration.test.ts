/**
 * Live LLM integration tests — run through the real ChatAssistant stack.
 *
 * Skipped in CI unless RUN_LLM_INTEGRATION=1 is set. Each provider is
 * additionally skipped when its API-key env var is absent.
 *
 * Required env vars (per provider):
 *   OpenAI:    OPENAI_API_KEY     [OPENAI_MODEL]
 *   Anthropic: ANTHROPIC_API_KEY  [ANTHROPIC_MODEL]
 *   Gemini:    GEMINI_API_KEY     [GEMINI_MODEL]
 *   Vertex:    VERTEX_CREDENTIALS (JSON)  [VERTEX_MODEL]
 */

import { beforeAll, describe, expect, test, vi } from 'vitest'

// Infrastructure mocks — must be declared before any app imports.
vi.mock('@/lib/env', () => ({
  default: {
    dumpLlmConversation: false,
    allowMockProvider: false,
    chat: {
      autoSummary: { enable: false },
      maxOutputTokens: undefined,
      disableParallelToolCalls: false,
    },
    knowledge: { sendInPrompt: false },
    fileStorage: { encryptFiles: false },
    tools: { websearch: { defaultApiUrl: '' } },
  },
}))
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
  loggingFetch: undefined,
}))
vi.mock('@/lib/satellite/hub', () => ({ connections: [], callSatelliteMethod: vi.fn() }))
vi.mock('@/lib/storage', () => ({ storage: { writeBuffer: vi.fn() } }))
vi.mock('@/models/file', () => ({ addFile: vi.fn() }))
vi.mock('@/lib/models', () => ({ llmModels: [] }))
vi.mock('@/models/backend', () => ({ getBackends: vi.fn().mockResolvedValue([]) }))
vi.mock('@/models/user', () => ({}))
vi.mock('@/db/database', () => ({ db: {} }))
vi.mock('@/db/dialect', () => ({ createDialect: () => null }))

import * as dto from '@/types/dto'
import { setTokenizerCounter } from '@/backend/lib/chat/prompt-token-counter'
import { countTextWithTokenizer } from '@/lib/chat/tokenizer'
import { ChatAssistant, type AssistantParams } from '@/backend/lib/chat'
import { AnthropicWebSearch } from '@/backend/lib/tools/anthropic.web_search/implementation'
import { GoogleAiStudioWebSearch } from '@/backend/lib/tools/google_ai_studio.web_search/implementation'
import { OpenaiWebSearch } from '@/backend/lib/tools/openai.web_search/implementation'
import type { ClientSink } from '@/backend/lib/chat/ClientSink'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import type { ProviderConfig } from '@/types/provider'

const ENABLED = process.env.RUN_LLM_INTEGRATION === '1'

// Provide a synchronous tokenizer shim so OpenAI tests don't need the worker thread.
beforeAll(() => {
  setTokenizerCounter({
    countText: async (tokenizer, text) => countTextWithTokenizer(tokenizer, text),
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(
  model: string,
  provider: LlmModel['provider'],
  owned_by: LlmModel['owned_by']
): LlmModel {
  return {
    id: model,
    model,
    name: model,
    description: 'integration test',
    context_length: 128_000,
    capabilities: { vision: false, function_calling: true },
    provider,
    owned_by,
  }
}

const testToolParams: ToolParams = { id: 'test', provisioned: false, promptFragment: '', name: 'test' }

// Trivial custom tool — always returns fixed data, needs no external API.
const weatherToolImpl: ToolImplementation = {
  toolParams: { id: 'test-weather', provisioned: false, promptFragment: '', name: 'weather' },
  supportedMedia: [],
  functions: async (): Promise<ToolFunctions> => ({
    get_weather: {
      description: 'Get the current weather for a city',
      parameters: {
        type: 'object' as const,
        properties: { city: { type: 'string', description: 'The city name' } },
        required: ['city'],
        additionalProperties: false,
      },
      invoke: async ({ params }) => ({
        type: 'json' as const,
        value: { city: params.city as string, temperature: 22, condition: 'sunny', unit: 'celsius' },
      }),
    },
  }),
}

/** ClientSink that buffers all events for later inspection. */
class TestSink implements ClientSink {
  readonly events: dto.TextStreamPart[] = []

  enqueue(event: dto.TextStreamPart) {
    this.events.push(event)
  }

  /** Joined text from all { type: 'text' } events. */
  getText(): string {
    return this.events
      .filter((e): e is { type: 'text'; text: string } => e.type === 'text')
      .map((e) => e.text)
      .join('')
  }

  /** Names of all tool-call parts emitted by ChatAssistant. */
  getToolCallNames(): string[] {
    return this.events
      .filter((e) => e.type === 'part')
      .map((e) => (e as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part)
      .filter((p): p is dto.ToolCallPart => p.type === 'tool-call')
      .map((p) => p.toolName)
  }

  /** Args of the first tool call with the given name, if any. */
  getToolCallArgs(toolName: string): Record<string, unknown> | undefined {
    return this.events
      .filter((e) => e.type === 'part')
      .map((e) => (e as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part)
      .filter((p): p is dto.ToolCallPart => p.type === 'tool-call' && p.toolName === toolName)
      .at(0)?.args
  }

  hasError(): boolean {
    return this.events.some(
      (e) =>
        e.type === 'part' &&
        (e as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part?.type === 'error'
    )
  }

  getErrors(): string[] {
    return this.events
      .filter(
        (e) =>
          e.type === 'part' &&
          (e as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part?.type === 'error'
      )
      .map(
        (e) =>
          ((e as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part as dto.ErrorPart)
            .error
      )
  }
}

function makeAssistant(
  config: ProviderConfig,
  model: LlmModel,
  tools: ToolImplementation[] = []
): ChatAssistant {
  const assistantParams: AssistantParams = {
    assistantId: 'test-assistant',
    model: model.model,
    systemPrompt: 'You are a concise test assistant.',
    temperature: 0,
    tokenLimit: 4096,
    reasoning_effort: null,
  }
  return new ChatAssistant(config, assistantParams, model, tools, { user: 'test-user' }, {}, [], { functions: {}, functionToolIdMap: new Map(), setupError: undefined })
}

async function runChat(assistant: ChatAssistant, content: string): Promise<TestSink> {
  const sink = new TestSink()
  const userMessage: dto.UserMessage = {
    id: 'msg-1',
    conversationId: 'conv-1',
    parent: null,
    sentAt: new Date().toISOString(),
    role: 'user',
    content,
    attachments: [],
  }
  await assistant.processUserMessageWithSink([userMessage], sink)
  return sink
}

// ---------------------------------------------------------------------------
// Provider matrix
// ---------------------------------------------------------------------------

type ProviderSpec = {
  name: string
  envKey: string
  config: () => ProviderConfig
  model: () => LlmModel
  /** Logicle ToolImplementation for native web search (tool-call based) */
  webSearchTool?: ToolImplementation
  /** Logicle ToolImplementation that contributes only providerOptions for search grounding */
  webSearchGrounding?: ToolImplementation
}

const providerSpecs: ProviderSpec[] = [
  {
    name: 'openai',
    envKey: 'OPENAI_API_KEY',
    config: () => ({
      providerType: 'openai',
      name: 'integration-openai',
      apiKey: process.env.OPENAI_API_KEY!,
      provisioned: false,
    }),
    model: () => makeModel(process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', 'openai', 'openai'),
    webSearchTool: new OpenaiWebSearch(testToolParams),
  },
  {
    name: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    config: () => ({
      providerType: 'anthropic',
      name: 'integration-anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      provisioned: false,
    }),
    model: () =>
      makeModel(
        process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
        'anthropic',
        'anthropic'
      ),
    webSearchTool: new AnthropicWebSearch(testToolParams),
  },
  {
    name: 'gemini',
    envKey: 'GEMINI_API_KEY',
    config: () => ({
      providerType: 'google-ai-studio',
      name: 'integration-gemini',
      apiKey: process.env.GEMINI_API_KEY!,
      provisioned: false,
    }),
    model: () => makeModel(process.env.GEMINI_MODEL ?? 'gemini-2.5-flash', 'google-ai-studio', 'gemini'),
    webSearchTool: new GoogleAiStudioWebSearch(testToolParams),
  },
  {
    name: 'vertex',
    envKey: 'VERTEX_CREDENTIALS',
    config: () => ({
      providerType: 'gcp-vertex',
      name: 'integration-vertex',
      credentials: process.env.VERTEX_CREDENTIALS!,
      provisioned: false,
    }),
    model: () =>
      makeModel(process.env.VERTEX_MODEL ?? 'gemini-2.5-flash', 'gcp-vertex', 'google'),
    webSearchGrounding: {
      toolParams: testToolParams,
      supportedMedia: [],
      functions: async () => ({}),
      providerOptions: () => ({ vertex: { useSearchGrounding: true } }),
    },
  },
]

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!ENABLED)('LLM integration', () => {
  for (const spec of providerSpecs) {
    const skip = !process.env[spec.envKey]

    describe.skipIf(skip)(spec.name, () => {
      let model: LlmModel
      let config: ProviderConfig

      function getConfig() {
        if (!config) config = spec.config()
        return config
      }
      function getModel() {
        if (!model) model = spec.model()
        return model
      }

      // ── 1. Simple request ─────────────────────────────────────────────────

      test('simple request returns non-empty text', async () => {
        const assistant = makeAssistant(getConfig(), getModel())
        const sink = await runChat(assistant, 'Reply with exactly three words: "integration test passed".')
        expect(sink.hasError()).toBe(false)
        const text = sink.getText()
        expect(text.length).toBeGreaterThan(0)
        expect(text.toLowerCase()).toContain('integration')
      }, 30_000)

      // ── 2. Web search ─────────────────────────────────────────────────────

      test('web search returns a grounded response', async () => {
        const searchImpl = spec.webSearchTool ?? spec.webSearchGrounding!
        const assistant = makeAssistant(getConfig(), getModel(), [searchImpl])
        const sink = await runChat(
          assistant,
          'Using web search, answer in one short sentence: what year did the first iPhone launch?'
        )
        expect(sink.hasError()).toBe(false)
        const text = sink.getText()
        expect(text.length).toBeGreaterThan(0)
        expect(text).toMatch(/2007/)
      }, 60_000)

      // ── 3. Custom tool (function calling) ─────────────────────────────────

      test('custom tool is called and result is used', async () => {
        const assistant = makeAssistant(getConfig(), getModel(), [weatherToolImpl])
        const sink = await runChat(
          assistant,
          'What is the weather like in Rome right now? Use the get_weather tool.'
        )
        expect(sink.hasError()).toBe(false)
        expect(sink.getToolCallNames()).toContain('get_weather')
        const args = sink.getToolCallArgs('get_weather')
        expect((args?.city as string | undefined)?.toLowerCase()).toContain('rome')
        const text = sink.getText()
        expect(text.length).toBeGreaterThan(0)
        expect(text.toLowerCase()).toMatch(/sunny|22|celsius/)
      }, 60_000)

      // ── 4. Custom tool + web search ───────────────────────────────────────

      test('custom tool and web search work together', async () => {
        const searchImpl = spec.webSearchTool ?? spec.webSearchGrounding!
        const assistant = makeAssistant(getConfig(), getModel(), [weatherToolImpl, searchImpl])
        const sink = await runChat(
          assistant,
          'First use get_weather to check the weather in Paris. ' +
            'Then use web search to find the current population of Paris. ' +
            'Summarise both in two sentences.'
        )
        expect(sink.hasError()).toBe(false)

        // Tool-based search providers (OpenAI, Anthropic, Gemini) produce discrete tool-call
        // events; grounding-based providers (Vertex) answer transparently.
        if (spec.webSearchTool) {
          expect(sink.getToolCallNames()).toContain('get_weather')
          const args = sink.getToolCallArgs('get_weather')
          expect((args?.city as string | undefined)?.toLowerCase()).toContain('paris')
        }

        expect(sink.getText().length).toBeGreaterThan(0)
      }, 90_000)
    })
  }
})

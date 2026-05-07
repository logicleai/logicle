/**
 * Live LLM integration tests.
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

import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  default: { dumpLlmConversation: false, allowMockProvider: false },
}))
vi.mock('@/lib/logging', () => ({ loggingFetch: undefined }))

import * as ai from 'ai'
import { z } from 'zod'
import * as anthropicSdk from '@ai-sdk/anthropic'
import { createLanguageModelBasic } from '@/backend/lib/chat/provider-factory'
import type { LlmModel } from '@/lib/chat/models'
import type { ProviderConfig } from '@/types/provider'

const ENABLED = process.env.RUN_LLM_INTEGRATION === '1'

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
    capabilities: { vision: false, function_calling: true, reasoning: false },
    provider,
    owned_by,
  }
}

// Trivial custom tool — always returns fixed data, needs no external API.
const weatherTool = ai.tool({
  description: 'Get the current weather for a city',
  inputSchema: z.object({ city: z.string().describe('The city name') }),
  execute: async ({ city }: { city: string }) => ({
    city,
    temperature: 22,
    condition: 'sunny',
    unit: 'celsius',
  }),
})

// Native provider-executed tool descriptor (web search variants).
function nativeTool(id: `${string}.${string}`): ai.Tool {
  return { type: 'provider', id, args: {}, inputSchema: z.any() }
}

// ---------------------------------------------------------------------------
// Provider matrix
// ---------------------------------------------------------------------------

type ProviderSpec = {
  name: string
  envKey: string
  config: () => ProviderConfig
  model: () => LlmModel
  /** Native web-search tool, if the provider exposes one as a tool call */
  webSearchTool?: () => ai.Tool
  /** Provider-level options for grounded search (Gemini / Vertex) */
  webSearchProviderOptions?: () => Record<string, unknown>
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
    model: () =>
      makeModel(process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', 'openai', 'openai'),
    webSearchTool: () => nativeTool('openai.web_search'),
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
    webSearchTool: () =>
      anthropicSdk.createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }).tools
        .webSearch_20250305(),
  },
  {
    name: 'gemini',
    envKey: 'GEMINI_API_KEY',
    config: () => ({
      providerType: 'gemini',
      name: 'integration-gemini',
      apiKey: process.env.GEMINI_API_KEY!,
      provisioned: false,
    }),
    model: () =>
      makeModel(
        process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
        'gemini',
        'gemini'
      ),
    webSearchProviderOptions: () => ({ google: { useSearchGrounding: true } }),
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
      makeModel(
        process.env.VERTEX_MODEL ?? 'gemini-2.5-flash',
        'gcp-vertex',
        'google'
      ),
    webSearchProviderOptions: () => ({ vertex: { useSearchGrounding: true } }),
  },
]

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!ENABLED)('LLM integration', () => {
  for (const spec of providerSpecs) {
    const skip = !process.env[spec.envKey]

    describe.skipIf(skip)(spec.name, () => {
      let languageModel: ReturnType<typeof createLanguageModelBasic>

      function getLanguageModel() {
        if (!languageModel) {
          languageModel = createLanguageModelBasic(spec.config(), spec.model())
        }
        return languageModel
      }

      // ── 1. Simple request ─────────────────────────────────────────────────

      test('simple request returns non-empty text', async () => {
        const result = await ai.generateText({
          model: getLanguageModel(),
          prompt: 'Reply with exactly three words: "integration test passed".',
          maxOutputTokens: 512,
        })
        expect(result.text.trim().length).toBeGreaterThan(0)
        expect(result.text.toLowerCase()).toContain('integration')
      }, 30_000)

      // ── 2. Web search ─────────────────────────────────────────────────────

      test('web search returns a grounded response', async () => {
        const tools = spec.webSearchTool ? { web_search: spec.webSearchTool() } : undefined
        const providerOptions = spec.webSearchProviderOptions?.() as any

        const result = await ai.generateText({
          model: getLanguageModel(),
          prompt:
            'Using web search, answer in one short sentence: what year did the first iPhone launch?',
          tools,
          providerOptions,
          maxOutputTokens: 1024,
          stopWhen: ai.stepCountIs(5),
        })

        expect(result.text.trim().length).toBeGreaterThan(0)
        expect(result.text).toMatch(/2007/)
      }, 60_000)

      // ── 3. Custom tool (function calling) ─────────────────────────────────

      test('custom tool is called and result is used', async () => {
        const result = await ai.generateText({
          model: getLanguageModel(),
          prompt: 'What is the weather like in Rome right now? Use the get_weather tool.',
          tools: { get_weather: weatherTool },
          maxOutputTokens: 256,
          stopWhen: ai.stepCountIs(5),
        })

        const toolCalls = result.steps.flatMap((s) => s.toolCalls)
        const weatherCall = toolCalls.find((c) => c.toolName === 'get_weather')
        expect(weatherCall).toBeDefined()
        expect((weatherCall!.input as { city: string }).city.toLowerCase()).toContain('rome')

        const text = result.text.trim()
        expect(text.length).toBeGreaterThan(0)
        expect(text.toLowerCase()).toMatch(/sunny|22|celsius/)
      }, 60_000)

      // ── 4. Custom tool + web search ───────────────────────────────────────

      test('custom tool and web search work together',
        async () => {
          const tools: Record<string, ai.Tool> = {
            get_weather: weatherTool,
            ...(spec.webSearchTool ? { web_search: spec.webSearchTool() } : {}),
          }
          const providerOptions = spec.webSearchProviderOptions?.() as any

          const result = await ai.generateText({
            model: getLanguageModel(),
            prompt:
              'First use get_weather to check the weather in Paris. ' +
              'Then use web search to find the current population of Paris. ' +
              'Summarise both in two sentences.',
            tools,
            providerOptions,
            maxOutputTokens: 512,
            stopWhen: ai.stepCountIs(8),
          })

          // For tool-based search providers (OpenAI) the model has explicit
          // tool calls we can inspect. For grounding-based providers (Gemini, Vertex)
          // the model may answer via grounding without invoking get_weather separately.
          if (spec.webSearchTool) {
            const toolCalls = result.steps.flatMap((s) => s.toolCalls)
            const weatherCall = toolCalls.find((c) => c.toolName === 'get_weather')
            expect(weatherCall).toBeDefined()
            expect((weatherCall!.input as { city: string }).city.toLowerCase()).toContain('paris')
          }

          expect(result.text.trim().length).toBeGreaterThan(0)
        },
        90_000
      )
    })
  }
})

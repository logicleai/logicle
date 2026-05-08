import { describe, expect, test, vi } from 'vitest'
import { ChatAssistant } from '@/backend/lib/chat'
import { GoogleAiStudioWebSearch } from '@/backend/lib/tools/google_ai_studio.web_search/implementation'
import { Router } from '@/backend/lib/tools/router/implementation'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunction, ToolImplementation, ToolParams } from '@/lib/chat/tools'

vi.mock('@/lib/satellite/hub', () => ({
  connections: [],
  callSatelliteMethod: vi.fn(),
}))
vi.mock('@/backend/lib/tools/enumerate', () => ({
  buildTool: vi.fn(),
}))

const gemini3Model = {
  id: 'gemini-30',
  model: 'gemini-3-pro-preview',
  name: 'Gemini 3.0 Pro',
  provider: 'google-ai-studio',
  owned_by: 'google',
  context_length: 1_000_000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
    web_search: true,
  },
} as unknown as LlmModel

const gemini25Model = {
  id: 'gemini-25',
  model: 'gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  provider: 'google-ai-studio',
  owned_by: 'google',
  context_length: 1_000_000,
  capabilities: {
    vision: true,
    function_calling: true,
    reasoning: true,
  },
} as unknown as LlmModel

const regularFn: ToolFunction = {
  description: 'Regular function tool',
  invoke: async () => ({ type: 'text', value: 'ok' }),
}

const regularTool: ToolImplementation = {
  supportedMedia: [],
  toolParams: {
    id: 'regular-tool',
    name: 'regular-tool',
    promptFragment: '',
    provisioned: false,
  } as ToolParams,
  async functions() {
    return { regular_function: regularFn }
  },
}

describe('Google native search compatibility', () => {
  test('includes google_search alongside regular function tools on Gemini 3.0', async () => {
    const googleSearchTool = new GoogleAiStudioWebSearch({
      id: 'google-search-tool',
      name: 'google-search-tool',
      promptFragment: '',
      provisioned: false,
    })

    const { functions } = await ChatAssistant.computeFunctions(
      [regularTool, googleSearchTool],
      gemini3Model,
      { userId: 'u1', assistantId: 'a1' }
    )

    expect(functions.regular_function).toBeDefined()
    expect(functions.google_search).toBeDefined()
  })

  test('via router: includes google_search alongside regular function tools on Gemini 3.0', async () => {
    const googleSearchTool = new GoogleAiStudioWebSearch({
      id: 'google-search-tool',
      name: 'google-search-tool',
      promptFragment: '',
      provisioned: false,
    })

    const router = new Router(
      { id: 'router-search', name: 'router-search', promptFragment: '', provisioned: false },
      [{ implementation: googleSearchTool }]
    )

    const { functions } = await ChatAssistant.computeFunctions(
      [regularTool, router],
      gemini3Model,
      { userId: 'u1', assistantId: 'a1' }
    )

    expect(functions.regular_function).toBeDefined()
    expect(functions.google_search).toBeDefined()
  })

  test('isModelSupported returns false for Gemini 2.5 (no web_search capability)', () => {
    const googleSearchTool = new GoogleAiStudioWebSearch({
      id: 'google-search-tool',
      name: 'google-search-tool',
      promptFragment: '',
      provisioned: false,
    })

    expect(googleSearchTool.isModelSupported(gemini25Model)).toBe(false)
    expect(googleSearchTool.isModelSupported(gemini3Model)).toBe(true)
  })
})

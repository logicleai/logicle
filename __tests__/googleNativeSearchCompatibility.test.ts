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

const model = {
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
    web_search: true,
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
  test('does not remove regular function tools when google native search tool is added', async () => {
    const googleSearchTool = new GoogleAiStudioWebSearch({
      id: 'google-search-tool',
      name: 'google-search-tool',
      promptFragment: '',
      provisioned: false,
    })

    const { functions, additionalProviderOptions } = await ChatAssistant.computeFunctions(
      [regularTool, googleSearchTool],
      model,
      { userId: 'u1', assistantId: 'a1' }
    )

    expect(functions.regular_function).toBeDefined()
    expect(functions.google_search).toBeUndefined()
    expect(additionalProviderOptions).toEqual({
      google: { useSearchGrounding: true },
    })
  })

  test('keeps regular functions when google native search is behind a router choice', async () => {
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

    const { functions, additionalProviderOptions } = await ChatAssistant.computeFunctions(
      [regularTool, router],
      model,
      { userId: 'u1', assistantId: 'a1' }
    )

    expect(functions.regular_function).toBeDefined()
    expect(functions.google_search).toBeUndefined()
    expect(additionalProviderOptions).toEqual({
      google: { useSearchGrounding: true },
    })
  })
})

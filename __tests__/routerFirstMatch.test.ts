import { describe, expect, test, vi } from 'vitest'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolImplementation, ToolParams } from '@/lib/chat/tools'

vi.mock('@/backend/lib/tools/enumerate', () => ({
  buildTool: vi.fn(),
}))

import { Router } from '@/backend/lib/tools/router/implementation'

const model = {
  id: 'm1',
  model: 'gemini-2.5-pro',
  name: 'Gemini',
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

const makeTool = (overrides: Partial<ToolImplementation>): ToolImplementation =>
  ({
    supportedMedia: [],
    toolParams: {
      id: 't1',
      name: 'tool',
      promptFragment: '',
      provisioned: false,
    } as ToolParams,
    functions: async () => ({}),
    ...overrides,
  }) as ToolImplementation

describe('Router first-match behavior', () => {
  test('returns only the first matching choice functions', async () => {
    const first = makeTool({
      functions: async () => ({
        google_search: { type: 'provider', id: 'google.google_search', args: {} },
      }),
    })
    const second = makeTool({
      functions: async () => ({
        dummy_fn: {
          description: 'dummy',
          invoke: async () => ({ type: 'text', value: 'ok' }),
        },
      }),
    })

    const router = new Router(
      { id: 'r1', name: 'router', promptFragment: '', provisioned: false },
      [{ implementation: first }, { implementation: second }]
    )

    const functions = await router.functions(model, { userId: 'u1' })
    expect(Object.keys(functions)).toEqual(['google_search'])
    expect(functions.dummy_fn).toBeUndefined()
  })

  test('returns provider options from first matching choice only', () => {
    const first = makeTool({
      providerOptions: () => ({ google: { retrievalConfig: { latLng: { latitude: 1, longitude: 2 } } } }),
    })
    const second = makeTool({
      providerOptions: () => ({ google: { labels: { source: 'second' } } }),
    })

    const router = new Router(
      { id: 'r2', name: 'router', promptFragment: '', provisioned: false },
      [{ implementation: first }, { implementation: second }]
    )

    const options = router.providerOptions(model)
    expect(options).toEqual({
      google: { retrievalConfig: { latLng: { latitude: 1, longitude: 2 } } },
    })
  })
})

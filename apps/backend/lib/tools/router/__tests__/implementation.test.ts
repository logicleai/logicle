import { describe, expect, it, vi } from 'vitest'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolImplementation, ToolParams } from '@/lib/chat/tools'

const mockBuildTool = vi.fn()

vi.mock('@/backend/lib/tools/enumerate', () => ({
  buildTool: (...args: unknown[]) => mockBuildTool(...args),
}))

import { Router } from '@/backend/lib/tools/router/implementation'

const model = { model: 'gemini-2.5-pro' } as unknown as LlmModel

const routerToolParams: ToolParams = {
  id: 'r1',
  name: 'router',
  promptFragment: '',
  provisioned: false,
}

const makeTool = (overrides: Partial<ToolImplementation>): ToolImplementation =>
  ({
    supportedMedia: [],
    toolParams: { id: 't1', name: 'tool', promptFragment: '', provisioned: false } as ToolParams,
    functions: async () => ({}),
    ...overrides,
  }) as ToolImplementation

describe('Router matching exclusions', () => {
  it('skips a choice whose implementation reports the model as unsupported', async () => {
    const unsupported = makeTool({
      isModelSupported: () => false,
      functions: async () => ({ from_unsupported: { description: '', invoke: async () => ({ type: 'text', value: 'x' }) } }),
    })
    const fallback = makeTool({
      functions: async () => ({ from_fallback: { description: '', invoke: async () => ({ type: 'text', value: 'x' }) } }),
    })
    const router = new Router(routerToolParams, [
      { implementation: unsupported },
      { implementation: fallback },
    ])

    const functions = await router.functions(model, { userId: 'u1' })

    expect(Object.keys(functions)).toEqual(['from_fallback'])
  })

  it('skips a choice whose restrictions exclude the current model', async () => {
    const restricted = makeTool({
      functions: async () => ({ from_restricted: { description: '', invoke: async () => ({ type: 'text', value: 'x' }) } }),
    })
    const fallback = makeTool({
      functions: async () => ({ from_fallback: { description: '', invoke: async () => ({ type: 'text', value: 'x' }) } }),
    })
    const router = new Router(routerToolParams, [
      { implementation: restricted, restrictions: { models: ['some-other-model'] } },
      { implementation: fallback },
    ])

    const functions = await router.functions(model, { userId: 'u1' })

    expect(Object.keys(functions)).toEqual(['from_fallback'])
  })

  it('matches a restricted choice when the current model is in its allow-list', async () => {
    const restricted = makeTool({
      functions: async () => ({ from_restricted: { description: '', invoke: async () => ({ type: 'text', value: 'x' }) } }),
    })
    const router = new Router(routerToolParams, [
      { implementation: restricted, restrictions: { models: ['gemini-2.5-pro'] } },
    ])

    const functions = await router.functions(model, { userId: 'u1' })

    expect(Object.keys(functions)).toEqual(['from_restricted'])
  })

  it('returns no functions and empty provider options when nothing matches', async () => {
    const unsupported = makeTool({ isModelSupported: () => false })
    const router = new Router(routerToolParams, [{ implementation: unsupported }])

    expect(await router.functions(model, { userId: 'u1' })).toEqual({})
    expect(router.providerOptions(model)).toEqual({})
  })
})

describe('Router.builder', () => {
  it('builds one implementation per choice and drops choices whose tool fails to build', async () => {
    mockBuildTool
      .mockResolvedValueOnce(
        makeTool({
          functions: async () => ({
            built: { description: '', invoke: async () => ({ type: 'text', value: 'x' }) },
          }),
        })
      )
      .mockResolvedValueOnce(undefined)

    const router = await Router.builder(
      routerToolParams,
      {
        choices: [
          { type: 'dummy', configuration: { a: 1 } },
          { type: 'unbuildable', configuration: {} },
        ],
      },
      'gemini-2.5-pro'
    )

    expect(mockBuildTool).toHaveBeenCalledTimes(2)
    expect(mockBuildTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'dummy', configuration: { a: 1 } }),
      'gemini-2.5-pro'
    )
    // Only the successfully built choice should end up in the router's choices.
    const functions = await (router as Router).functions(model, { userId: 'u1' })
    expect(Object.keys(functions)).toEqual(['built'])
  })
})

import { describe, expect, test } from 'vitest'
import { prepareTools } from '@/lib/chat/litellm/litellm-prepare-tools'
import type { LanguageModelV2CallOptions } from '@ai-sdk/provider'

const fnTool = (name: string): NonNullable<LanguageModelV2CallOptions['tools']>[number] => ({
  type: 'function',
  name,
  description: `${name} description`,
  inputSchema: { type: 'object', properties: {} },
})

const providerTool = (): NonNullable<LanguageModelV2CallOptions['tools']>[number] => ({
  type: 'provider',
  id: 'provider-tool-id',
} as any)

describe('prepareTools', () => {
  test('returns undefined tools when tools is null', () => {
    const result = prepareTools({ tools: null })
    expect(result.tools).toBeUndefined()
    expect(result.toolChoice).toBeUndefined()
    expect(result.toolWarnings).toEqual([])
  })

  test('converts function tools to openai-compatible format', () => {
    const result = prepareTools({ tools: [fnTool('search')] })
    expect(result.tools).toHaveLength(1)
    expect(result.tools![0]).toMatchObject({
      type: 'function',
      function: { name: 'search', description: 'search description' },
    })
    expect(result.toolWarnings).toHaveLength(0)
  })

  test('emits warning for provider tools and excludes them from output', () => {
    const result = prepareTools({ tools: [providerTool(), fnTool('calc')] })
    expect(result.tools).toHaveLength(1)
    expect(result.tools![0].function.name).toBe('calc')
    expect(result.toolWarnings).toHaveLength(1)
    expect(result.toolWarnings[0].type).toBe('unsupported-tool')
  })

  test('toolChoice auto/none/required are passed through as strings', () => {
    for (const type of ['auto', 'none', 'required'] as const) {
      const result = prepareTools({ tools: [fnTool('f')], toolChoice: { type } })
      expect(result.toolChoice).toBe(type)
    }
  })

  test('toolChoice "tool" becomes a function object', () => {
    const result = prepareTools({
      tools: [fnTool('myFn')],
      toolChoice: { type: 'tool', toolName: 'myFn' },
    })
    expect(result.toolChoice).toEqual({ type: 'function', function: { name: 'myFn' } })
  })

  test('no toolChoice returns undefined toolChoice', () => {
    const result = prepareTools({ tools: [fnTool('f')] })
    expect(result.toolChoice).toBeUndefined()
  })
})

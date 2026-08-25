import { describe, expect, test } from 'vitest'
import type { LanguageModelV3CallOptions, LanguageModelV3FunctionTool } from '@ai-sdk/provider'
import { EchoLanguageModel } from '../echo-language-model'

function userPrompt(text: string): LanguageModelV3CallOptions['prompt'] {
  return [{ role: 'user', content: [{ type: 'text', text }] }]
}

function options(overrides: Partial<LanguageModelV3CallOptions> = {}): LanguageModelV3CallOptions {
  return { prompt: userPrompt('hello'), ...overrides } as LanguageModelV3CallOptions
}

const weatherTool: LanguageModelV3FunctionTool = {
  type: 'function',
  name: 'get_weather',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' }, days: { type: 'number' }, exact: { type: 'boolean' } },
    required: ['city', 'days', 'exact'],
  },
}

async function collectStream(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const reader = stream.getReader()
  const parts: unknown[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  return parts
}

describe('EchoLanguageModel', () => {
  test('doGenerate echoes the last user message when no tools are offered', async () => {
    const model = new EchoLanguageModel()
    const result = await model.doGenerate(options({ prompt: userPrompt('hello integration') }))
    expect(result.content).toEqual([{ type: 'text', text: 'Echo: hello integration' }])
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' })
  })

  test('doGenerate picks the last user message when the prompt has multiple turns', async () => {
    const model = new EchoLanguageModel()
    const result = await model.doGenerate(
      options({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'first' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
          { role: 'user', content: [{ type: 'text', text: 'second' }] },
        ],
      })
    )
    expect(result.content).toEqual([{ type: 'text', text: 'Echo: second' }])
  })

  test('doGenerate calls the first function tool instead of answering when tools are offered', async () => {
    const model = new EchoLanguageModel()
    const result = await model.doGenerate(options({ tools: [weatherTool] }))
    expect(result.finishReason).toEqual({ unified: 'tool-calls', raw: 'tool_calls' })
    expect(result.content).toHaveLength(1)
    const [call] = result.content
    expect(call).toMatchObject({ type: 'tool-call', toolName: 'get_weather' })
    if (call.type !== 'tool-call') throw new Error('expected a tool-call')
    expect(JSON.parse(call.input as string)).toEqual({ city: 'mock', days: 0, exact: true })
  })

  test('doGenerate ignores non-function provider tools', async () => {
    const model = new EchoLanguageModel()
    const result = await model.doGenerate(
      options({ tools: [{ type: 'provider-defined', id: 'x.y', name: 'y', args: {} } as never] })
    )
    expect(result.content).toEqual([{ type: 'text', text: 'Echo: hello' }])
  })

  test('doGenerate echoes the tool result once one is present in the prompt', async () => {
    const model = new EchoLanguageModel()
    const result = await model.doGenerate(
      options({
        tools: [weatherTool],
        prompt: [
          ...userPrompt('what is the weather'),
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'get_weather',
                output: { type: 'text', value: 'sunny' },
              },
            ],
          },
        ],
      })
    )
    expect(result.content).toEqual([
      { type: 'text', text: 'Echo: what is the weather [tool result: sunny]' },
    ])
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' })
  })

  test('doGenerate stringifies a json tool result', async () => {
    const model = new EchoLanguageModel()
    const result = await model.doGenerate(
      options({
        tools: [weatherTool],
        prompt: [
          ...userPrompt('what is the weather'),
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'get_weather',
                output: { type: 'json', value: { temp: 22 } },
              },
            ],
          },
        ],
      })
    )
    expect(result.content).toEqual([
      { type: 'text', text: 'Echo: what is the weather [tool result: {"temp":22}]' },
    ])
  })

  test('doStream emits a plain echo when no tools are offered', async () => {
    const model = new EchoLanguageModel()
    const { stream } = await model.doStream(options({ prompt: userPrompt('stream me') }))
    const parts = await collectStream(stream)
    expect(parts).toContainEqual({ type: 'text-delta', id: 'text-0', delta: 'Echo: stream me' })
    expect(parts.some((p) => (p as { type: string }).type === 'tool-call')).toBe(false)
  })

  test('doStream emits a tool-call when tools are offered and no result is present yet', async () => {
    const model = new EchoLanguageModel()
    const { stream } = await model.doStream(options({ tools: [weatherTool] }))
    const parts = await collectStream(stream)
    const toolCall = parts.find((p) => (p as { type: string }).type === 'tool-call') as {
      toolName: string
      input: string
    }
    expect(toolCall).toBeDefined()
    expect(toolCall.toolName).toBe('get_weather')
    const finish = parts.find((p) => (p as { type: string }).type === 'finish') as {
      finishReason: { unified: string }
    }
    expect(finish.finishReason.unified).toBe('tool-calls')
  })

  test('doStream emits the tool result echo once a result is present in the prompt', async () => {
    const model = new EchoLanguageModel()
    const { stream } = await model.doStream(
      options({
        tools: [weatherTool],
        prompt: [
          ...userPrompt('what is the weather'),
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'get_weather',
                output: { type: 'text', value: 'sunny' },
              },
            ],
          },
        ],
      })
    )
    const parts = await collectStream(stream)
    expect(parts).toContainEqual({
      type: 'text-delta',
      id: 'text-0',
      delta: 'Echo: what is the weather [tool result: sunny]',
    })
  })
})

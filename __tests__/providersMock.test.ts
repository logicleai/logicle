import { describe, expect, test } from 'vitest'
import { LitellmChatLanguageModel } from '@/lib/chat/litellm/litellm-chat-language-model'
import { FetchFunction } from '@ai-sdk/provider-utils'

function modelOptions() {
  return {
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ],
    headers: {},
    maxOutputTokens: 32,
    temperature: 0,
    topP: undefined,
    topK: undefined,
    frequencyPenalty: undefined,
    presencePenalty: undefined,
    providerOptions: undefined,
    stopSequences: undefined,
    responseFormat: undefined,
    seed: undefined,
    toolChoice: undefined,
    tools: undefined,
    abortSignal: undefined,
  } as any
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function sseResponse(events: string[]) {
  const body = events.map((e) => `data: ${e}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function readStreamParts(stream: ReadableStream<any>) {
  const reader = stream.getReader()
  const parts: any[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  return parts
}

describe('Mocked provider integration', () => {
  const providerFamilies = [
    'openai',
    'anthropic',
    'gemini',
    'gcp-vertex',
    'perplexity',
    'logiclecloud',
  ] as const

  for (const provider of providerFamilies) {
    test(`doGenerate normalizes response for ${provider}`, async () => {
      const fetch: FetchFunction = async () =>
        jsonResponse({
          id: 'resp-1',
          model: 'fake-model',
          created: 123,
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'ok',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 3,
            completion_tokens: 2,
            total_tokens: 5,
            prompt_tokens_details: { cached_tokens: 1 },
            completion_tokens_details: {
              reasoning_tokens: 0,
              accepted_prediction_tokens: 2,
              rejected_prediction_tokens: 0,
            },
          },
        })

      const model = new LitellmChatLanguageModel('fake-model', {
        provider: `${provider}.chat`,
        headers: () => ({ authorization: 'Bearer test' }),
        url: () => 'https://mock.local/chat/completions',
        fetch,
      })

      const result = await model.doGenerate(modelOptions())
      expect(result.finishReason).toBe('stop')
      expect(result.content).toEqual([{ type: 'text', text: 'ok' }])
      expect(result.usage.inputTokens).toBe(3)
      expect(result.usage.outputTokens).toBe(2)
      expect(result.providerMetadata).toBeDefined()
      expect(result.providerMetadata?.[provider]).toBeDefined()
    })
  }

  test('doStream normalizes text + tool calls + finish reason', async () => {
    const fetch: FetchFunction = async () =>
      sseResponse([
        JSON.stringify({
          id: 'resp-1',
          model: 'fake-model',
          choices: [
            {
              delta: {
                content: 'Hello ',
              },
              finish_reason: null,
            },
          ],
        }),
        JSON.stringify({
          id: 'resp-1',
          model: 'fake-model',
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-1',
                    type: 'function',
                    function: {
                      name: 'lookup',
                      arguments: '{"q":"Rome"}',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        }),
        JSON.stringify({
          id: 'resp-1',
          model: 'fake-model',
          choices: [
            {
              delta: { content: 'world' },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 6,
            total_tokens: 10,
          },
        }),
      ])

    const model = new LitellmChatLanguageModel('fake-model', {
      provider: 'openai.chat',
      headers: () => ({}),
      url: () => 'https://mock.local/chat/completions',
      fetch,
      includeUsage: true,
    })

    const streamed = await model.doStream(modelOptions())
    const parts = await readStreamParts(streamed.stream)

    expect(parts.some((p) => p.type === 'text-delta' && p.delta.includes('Hello'))).toBe(true)
    expect(parts.some((p) => p.type === 'tool-call' && p.toolName === 'lookup')).toBe(true)

    const finish = parts.find((p) => p.type === 'finish')
    expect(finish).toBeDefined()
    expect(finish.finishReason).toBe('tool-calls')
    expect(finish.usage.inputTokens).toBe(4)
    expect(finish.usage.outputTokens).toBe(6)
  })

  test('error mapping keeps provider error message', async () => {
    const fetch: FetchFunction = async () =>
      jsonResponse(
        {
          error: {
            message: 'rate limit from provider',
            type: 'rate_limit_error',
          },
        },
        429
      )

    const model = new LitellmChatLanguageModel('fake-model', {
      provider: 'openai.chat',
      headers: () => ({}),
      url: () => 'https://mock.local/chat/completions',
      fetch,
    })

    await expect(model.doGenerate(modelOptions())).rejects.toThrow('rate limit from provider')
  })
})

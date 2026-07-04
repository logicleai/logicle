import { describe, expect, it, vi, beforeEach } from 'vitest'
import { WebSearch } from '@/backend/lib/tools/websearch/implementation'
import type { ToolFunction, ToolInvokeParams, ToolParams } from '@/lib/chat/tools'

const mockExpandToolParameter = vi.fn()

vi.mock('@/backend/lib/tools/configSecrets', () => ({
  expandToolParameter: (...args: unknown[]) => mockExpandToolParameter(...args),
}))

beforeEach(() => {
  mockExpandToolParameter.mockReset().mockResolvedValue('resolved-api-key')
})

const toolParams: ToolParams = {
  id: 'tool-1',
  provisioned: false,
  promptFragment: '',
  name: 'websearch',
}

function makeInvokeParams(query: string): ToolInvokeParams {
  const citations: any[] = []
  return {
    llmModel: {} as any,
    messages: [],
    assistantId: 'assistant-1',
    userId: 'user-1',
    params: { query },
    uiLink: {
      debugMessage: vi.fn(),
      addCitations: (c: any[]) => citations.push(...c),
      attachments: [],
      citations,
    },
  }
}

describe('WebSearch', () => {
  it('returns an error-text result with the status code when the search API call fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'boom',
    }) as any

    const tool = new WebSearch(toolParams, { apiKey: 'secret', apiUrl: null })
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>
    const invokeParams = makeInvokeParams('weather today')

    const result = await fns.WebSearch.invoke(invokeParams)

    expect(result).toEqual({
      type: 'error-text',
      value: 'Exa API error: 500 Internal Server Error boom',
    })
  })

  it('adds citations from the search results and returns the raw response as json', async () => {
    const responseBody = {
      requestId: 'r1',
      autopromptString: 'weather',
      resolvedSearchType: 'auto',
      results: [
        {
          id: '1',
          title: 'Weather today',
          url: 'https://example.com/weather',
          publishedDate: '2024-01-01',
          score: 0.9,
          summary: 'Sunny',
          favicon: 'https://example.com/favicon.ico',
        },
      ],
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    }) as any

    const tool = new WebSearch(toolParams, { apiKey: 'secret', apiUrl: null })
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>
    const invokeParams = makeInvokeParams('weather today')

    const result = await fns.WebSearch.invoke(invokeParams)

    expect(invokeParams.uiLink.citations).toEqual([
      {
        title: 'Weather today',
        summary: 'Sunny',
        url: 'https://example.com/weather',
        favicon: 'https://example.com/favicon.ico',
      },
    ])
    expect(result).toEqual({ type: 'json', value: responseBody })
  })

  it('resolves the secret api key via expandToolParameter and sends it as x-api-key', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }) as any

    const tool = new WebSearch(toolParams, { apiKey: 'secret-ref', apiUrl: 'https://custom.api/search' })
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>
    await fns.WebSearch.invoke(makeInvokeParams('q'))

    expect(mockExpandToolParameter).toHaveBeenCalledWith(toolParams, 'secret-ref')
    expect(global.fetch).toHaveBeenCalledWith(
      'https://custom.api/search',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'resolved-api-key' }),
      })
    )
  })
})

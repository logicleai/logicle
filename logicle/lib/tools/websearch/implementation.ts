import {
  ToolBuilder,
  ToolFunction,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { WebSearchInterface, WebSearchParams } from './interface'
import * as dto from '@/types/dto'
import { expandEnv } from 'templates'
import env from '@/lib/env'

export interface SearchResult {
  id: string
  title: string
  url: string
  publishedDate: string
  author?: string
  score: number
  summary: string
  image?: string
  favicon?: string
}

interface ExaSearchResponse {
  requestId: string
  autopromptString: string
  resolvedSearchType: string
  results: SearchResult[]
}

export class WebSearch extends WebSearchInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new WebSearch(toolParams, params as unknown as WebSearchParams)
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    private params: WebSearchParams
  ) {
    super()
  }

  functions = () => this.functions_

  functions_: ToolFunctions = {
    WebSearch: {
      description:
        'Search on the internet. When you use informations from one of the search results, include reference to it, using markdown syntax [x](http://blabla), where x is the index of the search result',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'User provided text of the query',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      requireConfirm: false,
      invoke: async ({ params, uiLink }) => {
        const { query } = params
        const apiKey = this.toolParams.provisioned
          ? expandEnv(this.params.apiKey)
          : this.params.apiKey
        const payload = {
          query: query,
          type: 'auto',
          contents: {
            text: false,
            summary: true,
          },
        }
        const response = await fetch(this.params.apiUrl ?? env.tools.websearch.defaultApiUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`Exa API error: ${response.status} ${response.statusText} ${text}`)
        }
        const responseBody = (await response.json()) as ExaSearchResponse
        await uiLink.newMessage()
        uiLink.addCitations(
          responseBody.results.map((r) => {
            const citation: dto.Citation = {
              title: r.title,
              summary: r.summary,
              url: r.url,
              favicon: r.favicon,
            }
            return citation
          })
        )
        return responseBody
      },
    },
  }
}

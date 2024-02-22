import fs from 'fs'
import { MessageDTO } from '@/types/chat'
import { ToolImplementation, ToolFunction, ToolBuilder } from '../../openai'
import { ChatGptRetrievalPluginInterface, ChatGptRetrievalPluginParams } from './interface'

interface RequestPayload {
  queries: [
    {
      query: string
      filter: {
        document_id: string
        source: string
        source_id: string
        author: string
        start_date: string
        end_date: string
      }
      top_k: number
    },
  ]
}

export interface Params {
  baseUrl: string
  apiKey: string
}

export class ChatGptRetrievalPlugin
  extends ChatGptRetrievalPluginInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (params: Record<string, any>) =>
    new ChatGptRetrievalPlugin(params as Params) // TODO: need a better validation
  params: ChatGptRetrievalPluginParams

  constructor(params: Params) {
    super()
    this.params = params
  }

  functions: ToolFunction[] = [
    {
      function: {
        name: 'query',
        description:
          "Search into previously uploaded documents if you think that your knowledge is not adequate or if the user requests it explicitly. Accepts search query objects array each with query and optional filter. Break down complex questions into sub-questions. Refine results by criteria, e.g. time / source, don't do this often. Split queries if ResponseTooLargeError occurs.",
        parameters: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    title: 'Query',
                  },
                  filter: {
                    type: 'object',
                    properties: {
                      document_id: {
                        type: 'string',
                        title: 'Document Id',
                      },
                      source: {
                        type: 'string',
                        enum: ['email', 'file', 'chat'],
                      },
                      source_id: {
                        type: 'string',
                        title: 'Source Id',
                      },
                      author: {
                        type: 'string',
                        title: 'Author',
                      },
                      start_date: {
                        type: 'string',
                        title: 'Start Date',
                      },
                      end_date: {
                        type: 'string',
                        title: 'End Date',
                      },
                    },
                  },
                  top_k: {
                    type: 'integer',
                    title: 'Top K',
                    default: 3,
                  },
                },
                required: ['query'],
              },
              description: 'Array of queries to be processed',
            },
          },
          required: ['queries'],
        },
      },
      invoke: async (messages: MessageDTO[], params: Record<string, any>) => {
        // TODO: do we want to make any validation here?
        const requestBody = params as RequestPayload
        for (const query of requestBody.queries) {
          if (query.top_k == undefined) {
            query.top_k = 3
          }
        }
        const body = JSON.stringify(requestBody)
        const response = await fetch(`${this.params.baseUrl}/query`, {
          method: 'POST',
          body,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.params.apiKey}`,
          },
        })
        return response.text()
      },
    },
  ]
  upload = async (id: string, path: string, contentType?: string) => {
    const fileContent = await fs.promises.readFile(path)
    const form = new FormData()
    form.append('file', new File([fileContent], 'ciao', { type: contentType }))
    //    form.append('metadata', '{}')
    const response = await fetch(`${this.params.baseUrl}/upsert-file`, {
      method: 'POST',
      body: form,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.params.apiKey}`,
      },
    })
    console.log(await response.text())
  }
}

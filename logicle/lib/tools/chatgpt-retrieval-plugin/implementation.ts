import {
  ToolImplementation,
  ToolBuilder,
  ToolImplementationUploadParams,
  ToolImplementationUploadResult,
  ToolFunctions,
} from '../../chat'
import { ChatGptRetrievalPluginInterface, ChatGptRetrievalPluginParams } from './interface'
import { db } from '@/db/database'
import { multipartFormBody } from '@/lib/forms'
import * as dto from '@/types/dto'

// The metadata which can be added and filtered
interface DocMetadata {
  document_id?: string
  source?: string
  source_id?: string
  author?: string
  start_date?: string
  end_date?: string
}

interface RequestPayload {
  queries: [
    {
      query: string
      filter?: DocMetadata
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
  // There is no metadata such as "owner", so... I'll use author
  fieldToUseForOwner: keyof DocMetadata = 'author'

  constructor(params: Params) {
    super()
    let baseUrl = params.baseUrl
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.substring(0, baseUrl.length - 1)

    this.params = {
      ...params,
      baseUrl: baseUrl,
    }
  }

  functions: ToolFunctions = {
    ChatGptRetrievalPluginList: {
      description: 'Get the list of uploaded documents',
      invoke: async () => {
        const list = await db
          .selectFrom('AssistantFile')
          .innerJoin('File', (join) => join.onRef('AssistantFile.fileId', '=', 'File.id'))
          .innerJoin('ToolFile', (join) => join.onRef('ToolFile.fileId', '=', 'File.id'))
          .select(['File.name', 'ToolFile.status'])
          .execute()
        return list.map((file) => JSON.stringify(file)).join('\n')
      },
    },
    ChatGptRetrievalPluginQuery: {
      description:
        "Search into previously uploaded documents. Accepts search query objects array each with query and optional filter. Break down complex questions into sub-questions. Refine results by criteria, e.g. time / source, don't do this often. Split queries if ResponseTooLargeError occurs.",
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
      invoke: async ({ assistantId, params }) => {
        // TODO: do we want to make any validation here?
        const requestBody = params as RequestPayload
        for (const query of requestBody.queries) {
          if (!query.filter) {
            query.filter = {}
          }
          query.filter[this.fieldToUseForOwner] = assistantId
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
  }
  processFile = async ({
    fileId,
    fileName,
    contentType,
    contentStream,
    assistantId,
  }: ToolImplementationUploadParams): Promise<ToolImplementationUploadResult> => {
    const metadata = {
      source_id: fileId,
    }
    metadata[this.fieldToUseForOwner] = assistantId

    const { headers: formHeaders, stream: readableForm } = multipartFormBody([
      {
        name: 'file',
        content: contentStream,
        contentType: contentType,
        filename: fileName,
      },
      {
        name: 'metadata',
        content: JSON.stringify(metadata),
        contentType: 'application/json',
      },
    ])
    const response = await fetch(`${this.params.baseUrl}/upsert-file`, {
      method: 'POST',
      body: readableForm,
      duplex: 'half',
      headers: {
        ...formHeaders,
        Accept: 'application/json',
        Authorization: `Bearer ${this.params.apiKey}`,
      },
    } as RequestInit) // force cast, as duplex (required!) is not defined in RequestInit
    if (response.status != 200) {
      throw new Error(
        `Failed submitting doc to ChatGPT retrieval plugin code = ${
          response.status
        } msg = ${await response.text()}`
      )
    }
    const responseBody = (await response.json()) as {
      ids: [string]
    }
    if (responseBody.ids.length != 1) {
      throw new Error(
        `Unexpected response from ChatGPT retrieval plugin during insertion. Expected ids[1], received = ${JSON.stringify(
          responseBody.ids
        )}`
      )
    }
    return {
      externalId: responseBody.ids[0],
    }
  }
  deleteDocuments = async (docIds: string[]): Promise<void> => {
    await fetch(`${this.params.baseUrl}/delete`, {
      method: 'DELETE',
      body: JSON.stringify({
        ids: docIds,
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.params.apiKey}`,
      },
    })
  }
}

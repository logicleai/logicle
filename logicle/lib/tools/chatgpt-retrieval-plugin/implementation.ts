import { MessageDTO } from '@/types/chat'
import {
  ToolImplementation,
  ToolFunction,
  ToolBuilder,
  ToolImplementationUploadParams,
  ToolImplementationUploadResult,
} from '../../openai'
import { ChatGptRetrievalPluginInterface, ChatGptRetrievalPluginParams } from './interface'
import { db } from '@/db/database'
import FormData from 'form-data'
import { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { ReadStream } from 'node:fs'

// Wrap a form, very similar to Node's ReadStream in a ReadableStream
// Unfortunately, the only library I found which does streaming form upload
// does not use ReadableStream WebAPIs, which is where Node is going to (I believe)
const formToReadable = (form: FormData) => {
  // We want backpressure... so we let the form "run" only when pull is invoked.
  // As soon as data is received, the form is paused.
  let resolve_: () => void
  return new ReadableStream({
    async start(controller) {
      form.on('data', (data) => {
        //console.log('data')
        form.pause()
        controller.enqueue(data)
        resolve_()
      })
      form.on('end', () => {
        //console.log('end')
        controller.close()
        resolve_()
      })
      form.on('error', () => {
        //console.log('error')
        controller.error()
        resolve_()
      })
    },
    async pull(controller) {
      //console.log('pull')
      return new Promise((resolve) => {
        resolve_ = resolve
        form.resume()
      })
    },
  })
}

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
  fieldToUseForOwner: keyof DocMetadata

  constructor(params: Params) {
    super()
    let baseUrl = params.baseUrl
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.substring(0, baseUrl.length - 1)

    this.params = {
      ...params,
      baseUrl: baseUrl,
    }
    this.fieldToUseForOwner = 'source' // I use source, because... it's the only one supported by chroma
  }

  functions: ToolFunction[] = [
    {
      function: {
        name: 'ChatGptRetrievalPluginList',
        description: 'Get the list of uploaded documents',
      },
      invoke: async (messages: MessageDTO[], assistantId: string, params: Record<string, any>) => {
        const list = await db
          .selectFrom('AssistantFile')
          .innerJoin('File', (join) => join.onRef('AssistantFile.fileId', '=', 'File.id'))
          .innerJoin('ToolFile', (join) => join.onRef('ToolFile.fileId', '=', 'File.id'))
          .select(['File.name', 'ToolFile.status'])
          .execute()
        return list.map((file) => JSON.stringify(file)).join('\n')
      },
    },
    {
      function: {
        name: 'ChatGptRetrievalPluginQuery',
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
      invoke: async (messages: MessageDTO[], assistantId: string, params: Record<string, any>) => {
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
  ]
  processFile = async ({
    fileId,
    fileName,
    contentType,
    contentStream,
    assistantId,
  }: ToolImplementationUploadParams): Promise<ToolImplementationUploadResult> => {
    const form = new FormData()
    form.append('file', ReadStream.fromWeb(contentStream as NodeReadableStream), {
      contentType,
      filename: fileName,
    })
    var metadata = {
      source_id: fileId,
    }
    metadata[this.fieldToUseForOwner] = assistantId
    form.append('metadata', JSON.stringify(metadata))
    const readableForm = formToReadable(form)
    const formHeaders = form.getHeaders()
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
}

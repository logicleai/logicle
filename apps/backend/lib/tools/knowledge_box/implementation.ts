import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import {
  KnowledgeBoxInterface,
  KnowledgeBoxSchema,
  type KnowledgeBoxParams,
} from '@/lib/tools/schemas'
import { searchBox } from '@/backend/lib/knowledge/retrieval'
import {
  listBoxDocuments,
  loadBoxProjections,
  loadFileChunkRange,
} from '@/backend/lib/knowledge/store'

/**
 * A knowledge box: a set of files indexed at ingestion time so the model can work with them
 * without paying to read them.
 *
 * Three functions, in increasing cost:
 *  - `list_documents` returns the admin's ingestion questions answered per file. This is the map:
 *    it tells the model which document is worth looking at before a single page is read.
 *  - `search` returns ranked chunks (BM25 over the box's own chunk set).
 *  - `read` returns a contiguous run of chunks, for when a search hit needs its surroundings.
 *
 * Everything is scoped by `boxId` (the tool id), so a box can only ever surface the files attached
 * to that tool — there is no file id a caller can pass to escape it.
 */

/** Chunks a single `read` call may return, to keep one call from swallowing the context window. */
const MAX_READ_CHUNKS = 12

const formatHeading = (heading: string | null) => (heading ? ` — ${heading}` : '')

export class KnowledgeBoxTool extends KnowledgeBoxInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new KnowledgeBoxTool(toolParams, KnowledgeBoxSchema.parse(params))

  supportedMedia = []
  // Deliberately not setting `knowledge`: the whole point of a box is to keep its files out of
  // the prompt. They are reached through the functions below instead.

  constructor(
    public toolParams: ToolParams,
    public params: KnowledgeBoxParams
  ) {
    super()
  }

  private get boxId() {
    return this.toolParams.id
  }

  functions = async (_model: LlmModel, _context: ToolFunctionContext) => this.functions_

  private fileNames(): Map<string, string> {
    return new Map(this.params.files.map((file) => [file.id, file.name]))
  }

  functions_: ToolFunctions = {
    list_documents: {
      description:
        'List the documents in this knowledge box, each with pre-computed answers to the questions this box was configured with. Call this first: it is cheap and it tells you which documents are worth searching.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
        required: [],
      },
      invoke: async (): Promise<dto.ToolCallResultOutput> => {
        const names = this.fileNames()
        if (names.size === 0) {
          return { type: 'text', value: 'This knowledge box contains no documents.' }
        }

        const documents = await listBoxDocuments(this.boxId)
        const statusByFile = new Map(documents.map((document) => [document.fileId, document]))
        const projections = await loadBoxProjections(this.boxId)
        const answersByFile = new Map<string, Map<string, string>>()
        for (const projection of projections) {
          if (!projection.answer) continue
          let answers = answersByFile.get(projection.fileId)
          if (!answers) {
            answers = new Map()
            answersByFile.set(projection.fileId, answers)
          }
          answers.set(projection.questionId, projection.answer)
        }

        const sections = this.params.files.map((file) => {
          const document = statusByFile.get(file.id)
          const lines = [`## ${file.name}`, `id: ${file.id}`]
          if (document?.status !== 'ready') {
            lines.push(`status: ${document?.status ?? 'not indexed'}`)
            if (document?.error) lines.push(`error: ${document.error}`)
            return lines.join('\n')
          }
          lines.push(`chunks: 0..${Math.max(0, document.chunkCount - 1)}`)
          const answers = answersByFile.get(file.id)
          for (const question of this.params.questions) {
            const answer = answers?.get(question.id)
            if (answer) lines.push(`${question.title}: ${answer}`)
          }
          return lines.join('\n')
        })

        return { type: 'text', value: sections.join('\n\n') }
      },
    },

    search: {
      description:
        'Full-text search across the documents of this knowledge box. Returns ranked passages with the document id and the chunk range they came from — use `read` with those to see more context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Words to search for. Keywords work better than a full sentence.',
          },
          fileIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional: restrict the search to these document ids, as returned by list_documents.',
          },
        },
        additionalProperties: false,
        required: ['query'],
      },
      invoke: async ({ params }): Promise<dto.ToolCallResultOutput> => {
        const query = `${params.query ?? ''}`.trim()
        if (!query) {
          return { type: 'error-text', value: 'Empty search query' }
        }
        const fileIds = Array.isArray(params.fileIds)
          ? params.fileIds.filter((id): id is string => typeof id === 'string')
          : undefined

        const hits = await searchBox(this.boxId, query, this.params.maxSearchResults, fileIds)
        if (hits.length === 0) {
          return { type: 'text', value: `No passage matched "${query}".` }
        }

        const names = this.fileNames()
        const rendered = hits.map((hit) => {
          const name = names.get(hit.fileId) ?? hit.fileId
          return `[${name} · id: ${hit.fileId} · chunk ${hit.seq}${formatHeading(hit.heading)}]\n${
            hit.text
          }`
        })
        return { type: 'text', value: rendered.join('\n\n---\n\n') }
      },
    },

    read: {
      description:
        'Read a contiguous range of chunks from one document of this knowledge box. Use it to expand around a search hit, or to walk a document that list_documents showed to be relevant.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'Document id, as returned by list_documents.' },
          from: { type: 'number', description: 'First chunk index (0-based). Defaults to 0.' },
          to: {
            type: 'number',
            description: `Last chunk index, inclusive. At most ${MAX_READ_CHUNKS} chunks are returned.`,
          },
        },
        additionalProperties: false,
        required: ['fileId'],
      },
      invoke: async ({ params }): Promise<dto.ToolCallResultOutput> => {
        const fileId = `${params.fileId ?? ''}`
        const names = this.fileNames()
        if (!names.has(fileId)) {
          return { type: 'error-text', value: `Document ${fileId} is not in this knowledge box` }
        }

        const from = Math.max(0, Number.isFinite(Number(params.from)) ? Number(params.from) : 0)
        const requestedTo = Number.isFinite(Number(params.to))
          ? Number(params.to)
          : from + MAX_READ_CHUNKS - 1
        const to = Math.min(requestedTo, from + MAX_READ_CHUNKS - 1)
        if (to < from) {
          return { type: 'error-text', value: '`to` must be greater than or equal to `from`' }
        }

        const chunks = await loadFileChunkRange(this.boxId, fileId, from, to)
        if (chunks.length === 0) {
          return {
            type: 'text',
            value: `No chunk in range ${from}..${to} for "${names.get(
              fileId
            )}". The document may still be indexing.`,
          }
        }

        const rendered = chunks.map(
          (chunk) => `[chunk ${chunk.seq}${formatHeading(chunk.heading)}]\n${chunk.text}`
        )
        return { type: 'text', value: rendered.join('\n\n') }
      },
    },
  }
}

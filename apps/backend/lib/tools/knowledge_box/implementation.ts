import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import { getFileWithId } from '@/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import {
  KnowledgeBoxInterface,
  KnowledgeBoxSchema,
  type KnowledgeBoxParams,
} from '@/lib/tools/schemas'
import { searchBox, searchBoxDocuments } from '@/backend/lib/knowledge/retrieval'
import {
  listBoxDocuments,
  loadBoxProjections,
  loadFileChunkRange,
} from '@/backend/lib/knowledge/store'

/**
 * A knowledge box: a set of files indexed at ingestion time so the model can work with them
 * without paying to read them.
 *
 * Four functions:
 *  - `list_documents` returns the document map, with file metadata and optional ingestion hints.
 *    It is ranked and budgeted, because a map that grows with the size of the box stops being cheap.
 *  - `search` returns ranked chunks (BM25 over the box's own chunk set).
 *  - `read` returns a contiguous run of chunks, for when a search hit needs its surroundings.
 *  - `get_file` returns the original file on demand, for source verification when extracted text
 *    is insufficient or the model needs to inspect a PDF/image directly.
 *
 * Everything is scoped by `boxId` (the tool id), so a box can only ever surface the files attached
 * to that tool — there is no file id a caller can pass to escape it.
 */

/** Chunks a single `read` call may return, to keep one call from swallowing the context window. */
const MAX_READ_CHUNKS = 12

/** Documents a `list_documents` call returns when the caller does not say otherwise. */
const DEFAULT_LIST_LIMIT = 10
const MAX_LIST_LIMIT = 50

/**
 * Character budget for the projection text in one listing.
 *
 * The listing is a directory, and a directory that grows with the size of the box defeats the
 * purpose of having one: at roughly 250 tokens of projections per document, returning them all
 * costs more than the documents the box was built to keep out of the prompt. The budget is spent
 * in rank order, so the documents most likely to matter arrive complete and the tail arrives as
 * bare entries the model can still ask about by id.
 */
const LIST_PROJECTION_BUDGET_CHARS = 6000

/** Keeps retrieved passages anchored as evidence instead of inviting unsupported conclusions. */
const SOURCE_EVIDENCE_INSTRUCTION =
  'Treat the passages below as source evidence. For every source-specific claim, use only what the passages state; preserve explicit conditions, exceptions, limits, and distinctions. Cite each source-specific sentence or bullet with the exact marker [file · chunk N] shown above it. Previous assistant messages and general knowledge are not evidence, and a prior claim must not be repeated unless these passages support it. Do not fill gaps with general knowledge or customary legal rules. Do not cite or link a document, page, URL, or fact unless it appears in these passages. For multi-part questions, omit unsupported subclaims or say that the source does not specify them.'

const KNOWLEDGE_BOX_SYSTEM_INSTRUCTION =
  '\nWhen researching with this knowledge box, treat retrieved passages as the only evidence for source-specific claims. Search results may be incomplete: search again or read surrounding chunks when needed. Every source-specific sentence or bullet in the final answer must have an inline citation to the exact [file · chunk N] marker that supports it. Do not use previous assistant messages, general knowledge, or customary rules to fill gaps. Do not invent or cite unsupported facts, pages, or URLs; if the source does not establish a requested detail, say so explicitly.\n'

const formatHeading = (heading: string | null) => (heading ? ` — ${heading}` : '')

export class KnowledgeBoxTool extends KnowledgeBoxInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new KnowledgeBoxTool(toolParams, KnowledgeBoxSchema.parse(params))

  supportedMedia = []
  // Deliberately not setting `knowledge`: the whole point of a box is to keep its files out of
  // the prompt. They are reached through the functions below instead.

  public toolParams: ToolParams

  constructor(
    toolParams: ToolParams,
    public params: KnowledgeBoxParams
  ) {
    super()
    this.toolParams = {
      ...toolParams,
      promptFragment: `${toolParams.promptFragment}${KNOWLEDGE_BOX_SYSTEM_INSTRUCTION}`,
    }
  }

  private get boxId() {
    return this.toolParams.id
  }

  functions = async (_model: LlmModel, _context: ToolFunctionContext) => this.functions_

  private fileNames(): Map<string, string> {
    return new Map(this.params.files.map((file) => [file.id, file.name]))
  }

  private resolveFileSelector(selector: string): KnowledgeBoxParams['files'][number] | undefined {
    const normalized = selector.trim().toLocaleLowerCase()
    return this.params.files.find(
      (file) => file.id === selector || file.name.trim().toLocaleLowerCase() === normalized
    )
  }

  private hasCurrentTurnSourceLookup(messages: dto.Message[]): boolean {
    let lastUserIndex = -1
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const role = messages[index]?.role
      if (role === 'user' || role === 'user-response') {
        lastUserIndex = index
        break
      }
    }
    const sourceLookupNames = new Set([
      'search',
      'read',
      `${this.toolParams.name}__search`,
      `${this.toolParams.name}__read`,
    ])
    return messages
      .slice(lastUserIndex + 1)
      .some(
        (message) =>
          message.role === 'tool' &&
          message.parts.some(
            (part) =>
              part.type === 'tool-result' &&
              (sourceLookupNames.has(part.toolName) ||
                part.toolName.endsWith('__search') ||
                part.toolName.endsWith('__read'))
          )
      )
  }

  /**
   * Orders the box's configured files by relevance to a query, best first.
   *
   * Ranking can return fewer files than asked for — a query that matches nothing returns none —
   * so the remainder is topped up in configured order. A listing that came back empty because the
   * query was unlucky would be worse than one that is merely unsorted.
   */
  private async rankFiles(query: string, limit: number): Promise<KnowledgeBoxParams['files']> {
    const byId = new Map(this.params.files.map((file) => [file.id, file]))
    const rankedIds = await searchBoxDocuments(this.boxId, query, limit)

    const ordered: KnowledgeBoxParams['files'] = []
    const taken = new Set<string>()
    for (const fileId of rankedIds) {
      const file = byId.get(fileId)
      if (!file || taken.has(fileId)) continue
      taken.add(fileId)
      ordered.push(file)
    }
    for (const file of this.params.files) {
      if (ordered.length >= limit) break
      if (taken.has(file.id)) continue
      ordered.push(file)
    }
    return ordered.slice(0, limit)
  }

  functions_: ToolFunctions = {
    list_documents: {
      description:
        'List documents in this knowledge box. It returns names, file metadata, and optional pre-computed navigation hints; these are not authoritative answers. Pass a query to rank documents by relevance when useful, then use search/read to inspect source text.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Optional: what you are looking for. Ranks documents by their name and available navigation hints, returning the most relevant first.',
          },
          limit: {
            type: 'number',
            description: `Optional: how many documents to return (default ${DEFAULT_LIST_LIMIT}, maximum ${MAX_LIST_LIMIT}).`,
          },
        },
        additionalProperties: false,
        required: [],
      },
      invoke: async ({ params }): Promise<dto.ToolCallResultOutput> => {
        const names = this.fileNames()
        if (names.size === 0) {
          return { type: 'text', value: 'This knowledge box contains no documents.' }
        }

        const query = `${params.query ?? ''}`.trim()
        const requestedLimit = Number(params.limit)
        const limit = Math.min(
          MAX_LIST_LIMIT,
          Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIST_LIMIT)
        )

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

        const ordered = query
          ? await this.rankFiles(query, limit)
          : this.params.files.slice(0, limit)

        // Spend the projection budget in rank order: the documents most likely to matter get their
        // answers in full, and the rest still appear as entries the model can search or read by id.
        let remainingBudget = LIST_PROJECTION_BUDGET_CHARS
        const sections = ordered.map((file) => {
          const document = statusByFile.get(file.id)
          const lines = [
            `## ${file.name}`,
            `id: ${file.id}`,
            `type: ${file.type}`,
            `size: ${file.size} bytes`,
          ]
          if (document?.status !== 'ready') {
            lines.push(`status: ${document?.status ?? 'not indexed'}`)
            if (document?.error) lines.push(`error: ${document.error}`)
            return lines.join('\n')
          }
          lines.push(`chunks: 0..${Math.max(0, document.chunkCount - 1)}`)
          const answers = answersByFile.get(file.id)
          let omitted = false
          for (const question of this.params.questions) {
            const answer = answers?.get(question.id)
            if (!answer) continue
            const entry = `${question.title}: ${answer}`
            if (entry.length > remainingBudget) {
              omitted = true
              continue
            }
            remainingBudget -= entry.length
            lines.push(entry)
          }
          if (omitted) {
            lines.push(
              '(answers omitted to keep this listing short — search or read this document)'
            )
          }
          return lines.join('\n')
        })

        if (ordered.length < this.params.files.length) {
          sections.push(
            `(showing ${ordered.length} of ${this.params.files.length} documents${
              query ? '' : ' — pass a query to rank them by relevance'
            })`
          )
        }

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
              'Optional: restrict the search to these document ids or exact document names, as returned by list_documents.',
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
        const requestedFileIds = Array.isArray(params.fileIds)
          ? params.fileIds.filter((id): id is string => typeof id === 'string')
          : []
        const fileIds = requestedFileIds.map((selector) => this.resolveFileSelector(selector)?.id)
        if (requestedFileIds.length > 0 && fileIds.some((fileId) => !fileId)) {
          return {
            type: 'error-text',
            value:
              'Every file selector must be a document id or exact document name from list_documents.',
          }
        }

        const hits = await searchBox(
          this.boxId,
          query,
          this.params.maxSearchResults,
          fileIds.length > 0 ? fileIds.filter((fileId): fileId is string => !!fileId) : undefined
        )
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
        return {
          type: 'text',
          value: `${SOURCE_EVIDENCE_INSTRUCTION}\n\n${rendered.join('\n\n---\n\n')}`,
        }
      },
    },

    get_file: {
      description:
        'Retrieve the original file from this knowledge box on demand. This may add the whole file to the context: do not use it for ordinary text questions. Use it only after search/read when exact layout, tables, images, or OCR-sensitive details need verification.',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'Document id or exact document name, as returned by list_documents.',
          },
        },
        additionalProperties: false,
        required: ['fileId'],
      },
      invoke: async ({ params, userId, messages }): Promise<dto.ToolCallResultOutput> => {
        const selector = `${params.fileId ?? ''}`
        const file = this.resolveFileSelector(selector)
        if (!file) {
          return { type: 'error-text', value: `Document ${selector} is not in this knowledge box` }
        }
        const fileId = file.id
        if (!this.hasCurrentTurnSourceLookup(messages)) {
          return {
            type: 'error-text',
            value:
              'Search or read a passage from this knowledge box before retrieving the original file.',
          }
        }
        if (!(await canAccessFile({ userId }, fileId))) {
          return { type: 'error-text', value: 'File not found' }
        }
        const fileEntry = await getFileWithId(fileId)
        if (!fileEntry) {
          return { type: 'error-text', value: 'File not found' }
        }
        return {
          type: 'content',
          value: [
            {
              type: 'file',
              id: fileEntry.id,
              name: fileEntry.name,
              size: fileEntry.size ?? file.size,
              mimetype: fileEntry.type,
              uiHidden: true,
            },
          ],
        }
      },
    },

    read: {
      description:
        'Read a contiguous range of chunks from one document of this knowledge box. Use it to expand around a search hit, or to walk a document that list_documents showed to be relevant.',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'Document id or exact document name, as returned by list_documents.',
          },
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
        const selector = `${params.fileId ?? ''}`
        const file = this.resolveFileSelector(selector)
        const names = this.fileNames()
        if (!file) {
          return { type: 'error-text', value: `Document ${selector} is not in this knowledge box` }
        }
        const fileId = file.id

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
        return {
          type: 'text',
          value: `${SOURCE_EVIDENCE_INSTRUCTION}\n\n${rendered.join('\n\n')}`,
        }
      },
    },
  }
}

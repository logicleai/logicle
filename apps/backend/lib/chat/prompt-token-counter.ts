import * as ai from 'ai'
import { createHash } from 'node:crypto'
import { LRUCache } from 'lru-cache'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { acceptableImageTypes } from './file-attachment-policy'
import { estimateNativeImageTokens } from '@/backend/lib/chat/image-token-estimator'
import type { PromptSegment } from './index'
import { LlmModel } from '@/lib/chat/models'
import { countTextForModel, tokenizerForModel } from '@/lib/chat/tokenizer'
import type { TokenizerWorkerRuntime } from './tokenizer-worker/runtime'

let tokenizerWorker: TokenizerWorkerRuntime | null = null

export const setTokenizerWorker = (worker: TokenizerWorkerRuntime) => {
  tokenizerWorker = worker
}

const countTextViaWorkerOrFallback = (
  tokenizer: 'cl100k_base' | 'o200k_base',
  text: string,
  model: LlmModel
): Promise<number> => {
  if (tokenizerWorker) {
    return tokenizerWorker.countText(tokenizer, text)
  }
  // Fallback: run synchronously in the calling thread (e.g. during tests)
  return Promise.resolve(countTextForModel(model, text))
}

export type TokenCountCacheStats = {
  textTokensCache: {
    hits: number
    misses: number
  }
  fileTokenCache: {
    hits: number
    misses: number
  }
}

const estimatorVersion = 2
const textTokensCache = new LRUCache<string, number>({
  max: Number.parseInt(process.env.TOKEN_ESTIMATOR_TEXT_CACHE_MAX_ENTRIES ?? '50000', 10) || 50000,
})

const hashKey = (...parts: string[]) => createHash('sha256').update(parts.join('|')).digest('hex')

const normalizeText = (text: string) => text.replace(/\r\n/g, '\n')

export const createTokenCountCacheStats = (): TokenCountCacheStats => ({
  textTokensCache: { hits: 0, misses: 0 },
  fileTokenCache: { hits: 0, misses: 0 },
})

export const countTextTokensCached = async (
  model: LlmModel,
  text: string,
  stats?: TokenCountCacheStats
): Promise<number> => {
  if (!text) return 0
  const tokenizer = tokenizerForModel(model)
  if (tokenizer === 'approx_4chars') {
    return Math.ceil(text.length / 4)
  }
  const normalized = normalizeText(text)
  const key = hashKey('text', String(estimatorVersion), tokenizer, model.id, normalized)
  const cached = textTokensCache.get(key)
  if (cached !== undefined) {
    if (stats) stats.textTokensCache.hits++
    return cached
  }
  if (stats) stats.textTokensCache.misses++
  const computed = await countTextViaWorkerOrFallback(tokenizer, normalized, model)
  textTokensCache.set(key, computed)
  return computed
}

const parseDataUrl = (value: string) => {
  const match = value.match(/^data:([^;]+);base64,(.*)$/s)
  if (!match) return null
  return {
    mediaType: match[1],
    data: match[2],
  }
}

export const countDtoToolResultOutputTokens = async (
  model: LlmModel,
  output: dto.ToolCallResultOutput,
  stats?: TokenCountCacheStats
): Promise<number> => {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return countTextTokensCached(model, output.value, stats)
    case 'json':
    case 'error-json':
      return countTextTokensCached(model, JSON.stringify(output.value), stats)
    case 'content': {
      let tokens = 0
      for (const item of output.value) {
        if (item.type === 'text') {
          tokens += await countTextTokensCached(model, item.text, stats)
        } else if (item.type === 'file') {
          tokens += await countTextTokensCached(
            model,
            JSON.stringify({ name: item.name, mimetype: item.mimetype }),
            stats
          )
        }
      }
      return tokens
    }
  }
}

export const countModelMessageTokens = async (
  model: LlmModel,
  message: ai.ModelMessage,
  stats?: TokenCountCacheStats
): Promise<number> => {
  if (typeof message.content === 'string') {
    return countTextTokensCached(model, message.content, stats)
  }
  if (!Array.isArray(message.content)) {
    return 0
  }

  let tokens = 0
  for (const part of message.content) {
    if (!part || typeof part !== 'object' || !('type' in part)) continue
    switch (part.type) {
      case 'text':
      case 'reasoning':
        tokens += await countTextTokensCached(model, part.text, stats)
        break
      case 'tool-call':
        tokens += await countTextTokensCached(
          model,
          JSON.stringify({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          }),
          stats
        )
        break
      case 'tool-result':
        tokens += await countTextTokensCached(
          model,
          JSON.stringify({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
          }),
          stats
        )
        tokens += await countTextTokensCached(model, JSON.stringify(part.output), stats)
        break
      case 'image': {
        if (typeof part.image === 'string') {
          const parsed = parseDataUrl(part.image)
          if (parsed && acceptableImageTypes.includes(parsed.mediaType)) {
            tokens += Math.ceil(
              await estimateNativeImageTokens(model, Buffer.from(parsed.data, 'base64'))
            )
          } else {
            tokens += await countTextTokensCached(model, part.image, stats)
          }
        }
        break
      }
      case 'file': {
        // PDF file parts are counted separately via file analysis in token-estimator.
        // Non-PDF files are counted by their metadata.
        if (part.mediaType !== 'application/pdf') {
          tokens += await countTextTokensCached(
            model,
            JSON.stringify({
              filename: part.filename,
              mediaType: part.mediaType,
            }),
            stats
          )
        }
        break
      }
      default:
        tokens += await countTextTokensCached(model, JSON.stringify(part), stats)
        break
    }
  }
  return tokens
}

export const countPromptSegmentsTokens = async (
  model: LlmModel,
  segments: PromptSegment[],
  stats?: TokenCountCacheStats
) => {
  let assistant = 0
  let history = 0
  let draft = 0

  for (const segment of segments) {
    const tokens = await countModelMessageTokens(model, segment.message, stats)
    if (segment.scope === 'prompt') {
      assistant += tokens
    } else if (segment.scope === 'history') {
      history += tokens
    } else {
      draft += tokens
    }
  }

  return {
    assistant,
    history,
    draft,
  }
}

export const createPendingUserMessage = async (
  attachmentFileIds: string[],
  draftText: string
): Promise<dto.UserMessage | null> => {
  if (attachmentFileIds.length === 0 && draftText.length === 0) {
    return null
  }
  const files = await Promise.all(attachmentFileIds.map((fileId) => getFileWithId(fileId)))
  const attachments: dto.Attachment[] = files
    .filter((file): file is NonNullable<typeof file> => !!file && file.uploaded === 1)
    .map((file) => ({
      id: file.id,
      name: file.name,
      mimetype: file.type,
      size: file.size,
    }))

  return {
    id: 'pending-estimate-message',
    conversationId: 'pending-estimate-conversation',
    parent: null,
    sentAt: new Date(0).toISOString(),
    citations: [],
    role: 'user',
    content: draftText,
    attachments,
  }
}

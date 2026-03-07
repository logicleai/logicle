import { createHash } from 'node:crypto'
import { LRUCache } from 'lru-cache'
import * as dto from '@/types/dto'
import { LlmModel } from './models'
import { tokenizerForModel, countTextForModel, buildKnowledgePrompt } from './tokenizer'
import { getFileWithId } from '@/models/file'
import { cachingExtractor } from '@/lib/textextraction/cache'
import env from '@/lib/env'
import { acceptableImageTypes } from './conversion'

type CacheStats = {
  textTokensCache: {
    hits: number
    misses: number
  }
  fileTokenCache: {
    hits: number
    misses: number
  }
}

export type TokenEstimateBreakdown = {
  systemPromptTokens: number
  knowledgeTokens: number
  historyTokens: number
  attachmentTokens: number
  draftTextTokens: number
  baseInputTokens: number
  totalInputTokens: number
}

export type TokenEstimateResult = {
  estimate: TokenEstimateBreakdown
  cache: CacheStats
}

type TokenEstimateInput = {
  model: LlmModel
  systemPrompt: string
  knowledgeFiles: dto.AssistantFile[]
  includeKnowledge: boolean
  history: dto.Message[]
  draftText: string
  attachmentFileIds: string[]
}

type TokenEstimatorCacheConfig = {
  textTokensMaxEntries: number
  fileTokensMaxEntries: number
}

const estimatorVersion = 1
const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

const defaultCacheConfig: TokenEstimatorCacheConfig = {
  textTokensMaxEntries: parsePositiveInt(process.env.TOKEN_ESTIMATOR_TEXT_CACHE_MAX_ENTRIES, 50000),
  fileTokensMaxEntries: parsePositiveInt(process.env.TOKEN_ESTIMATOR_FILE_CACHE_MAX_ENTRIES, 10000),
}

const textTokensCache = new LRUCache<string, number>({
  max: defaultCacheConfig.textTokensMaxEntries,
})

const fileTokenCache = new LRUCache<string, number>({
  max: defaultCacheConfig.fileTokensMaxEntries,
})

const hashKey = (...parts: string[]) => createHash('sha256').update(parts.join('|')).digest('hex')

const normalizeText = (text: string) => text.replace(/\r\n/g, '\n')

const countTextTokensCached = (model: LlmModel, text: string, stats: CacheStats) => {
  if (!text) return 0
  const normalized = normalizeText(text)
  const key = hashKey(
    'text',
    String(estimatorVersion),
    tokenizerForModel(model),
    model.id,
    normalized
  )
  const cached = textTokensCache.get(key)
  if (cached !== undefined) {
    stats.textTokensCache.hits++
    return cached
  }
  stats.textTokensCache.misses++
  const computed = countTextForModel(model, normalized)
  textTokensCache.set(key, computed)
  return computed
}

const estimateFileAsText = async (file: { id: string; name: string; type: string }) => {
  if (env.chat.enableAttachmentConversion) {
    const fileEntry = await getFileWithId(file.id)
    if (fileEntry) {
      const extracted = await cachingExtractor.extractFromFile(fileEntry)
      if (extracted) {
        return `Here is the text content of the file "${file.name}" with id ${file.id}\n${extracted}`
      }
    }
  }
  return `The content of the file "${file.name}" with id ${file.id} could not be extracted. It is possible that some tools can return the content on demand`
}

const estimateSingleFileTokens = async (
  model: LlmModel,
  file: { id: string; name: string; type: string; size: number },
  stats: CacheStats
) => {
  const isNativeImage = model.capabilities.vision && acceptableImageTypes.includes(file.type)
  const isNativeFile = !!model.capabilities.supportedMedia?.includes(file.type)
  const fileMode = isNativeImage || isNativeFile ? 'native-media' : 'text-conversion'

  const key = hashKey(
    'file',
    String(estimatorVersion),
    tokenizerForModel(model),
    model.id,
    file.id,
    file.type,
    String(file.size),
    fileMode,
    env.chat.enableAttachmentConversion ? '1' : '0'
  )
  const cached = fileTokenCache.get(key)
  if (cached !== undefined) {
    stats.fileTokenCache.hits++
    return cached
  }

  stats.fileTokenCache.misses++
  let estimate = 0
  if (fileMode === 'text-conversion') {
    const textPrompt = await estimateFileAsText(file)
    estimate = countTextTokensCached(model, textPrompt, stats)
  }
  fileTokenCache.set(key, estimate)
  return estimate
}

const estimateAttachmentsByEntries = async (
  model: LlmModel,
  attachments: dto.Attachment[],
  stats: CacheStats
) => {
  if (attachments.length === 0) return 0
  let total = 0
  total += countTextTokensCached(
    model,
    `The user has attached the following files to this chat: \n${JSON.stringify(attachments)}`,
    stats
  )
  const files = await Promise.all(attachments.map((attachment) => getFileWithId(attachment.id)))
  for (const file of files) {
    if (!file) continue
    total += await estimateSingleFileTokens(model, file, stats)
  }
  return total
}

const countHistoryMessageTokens = async (
  model: LlmModel,
  msg: dto.Message,
  stats: CacheStats
): Promise<number> => {
  if (msg.role === 'user') {
    let tokens = countTextTokensCached(model, msg.content, stats)
    tokens += await estimateAttachmentsByEntries(model, msg.attachments, stats)
    return tokens
  }
  if (msg.role === 'assistant') {
    return msg.parts.reduce((sum, part) => {
      if (part.type !== 'text') return sum
      return sum + countTextTokensCached(model, part.text, stats)
    }, 0)
  }
  return 0
}

const estimateAttachmentsTokens = async (
  model: LlmModel,
  attachmentFileIds: string[],
  stats: CacheStats
) => {
  if (attachmentFileIds.length === 0) return 0
  const files = await Promise.all(attachmentFileIds.map((fileId) => getFileWithId(fileId)))
  const presentFiles = files.filter((f) => !!f)
  const attachments: dto.Attachment[] = presentFiles.map((file) => ({
    id: file.id,
    name: file.name,
    mimetype: file.type,
    size: file.size,
  }))

  return await estimateAttachmentsByEntries(model, attachments, stats)
}

export const estimateInputTokens = async (
  input: TokenEstimateInput
): Promise<TokenEstimateResult> => {
  const stats: CacheStats = {
    textTokensCache: { hits: 0, misses: 0 },
    fileTokenCache: { hits: 0, misses: 0 },
  }
  const {
    model,
    systemPrompt,
    history,
    includeKnowledge,
    knowledgeFiles,
    draftText,
    attachmentFileIds,
  } = input

  const systemPromptTokens = countTextTokensCached(model, systemPrompt, stats)
  const knowledgeTokens = includeKnowledge
    ? countTextTokensCached(model, buildKnowledgePrompt(knowledgeFiles), stats)
    : 0
  let historyTokens = 0
  for (const message of history) {
    historyTokens += await countHistoryMessageTokens(model, message, stats)
  }
  const draftTextTokens = countTextTokensCached(model, draftText, stats)
  const attachmentTokens = await estimateAttachmentsTokens(model, attachmentFileIds, stats)
  const baseInputTokens = systemPromptTokens + knowledgeTokens + historyTokens + attachmentTokens
  const totalInputTokens = baseInputTokens + draftTextTokens

  return {
    estimate: {
      systemPromptTokens,
      knowledgeTokens,
      historyTokens,
      attachmentTokens,
      draftTextTokens,
      baseInputTokens,
      totalInputTokens,
    },
    cache: stats,
  }
}

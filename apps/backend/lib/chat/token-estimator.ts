import * as dto from '@/types/dto'
import { LRUCache } from 'lru-cache'
import { LlmModel } from '@/lib/chat/models'
import type { AssistantParams } from './index'
import { ToolImplementation } from '@/lib/chat/tools'
import type { ParameterValueAndDescription } from '@/models/user'
import { getFileWithId } from '@/models/file'
import { ensureFileAnalysis, isReadyFileAnalysis, readExtractedTextFromAnalysis } from '@/lib/file-analysis'
import {
  isImageAnalysisPayload,
  isPdfAnalysisPayload,
  isPdfOverNativePageLimit,
  PdfAnalysisPayload,
} from '@/lib/file-analysis/payload'
import {
  resolvePdfEstimatorModel,
  predictPdfTokenCount,
  normalizeExtractedText,
} from '@/backend/lib/chat/pdf-token-estimator'
import {
  acceptableImageTypes,
  getPdfAttachmentPageLimitText,
} from '@/backend/lib/chat/file-attachment-policy'
import { estimateNativeImageTokensFromDimensions } from '@/backend/lib/chat/image-token-estimator'
import { countTextForModel } from '@/lib/chat/tokenizer'
import { cachingExtractor } from '@/lib/textextraction/cache'
import {
  countTextTokensCached,
  countDtoToolResultOutputTokens,
  countPromptSegmentsTokens,
  createPendingUserMessage,
  createTokenCountCacheStats,
  TokenCountCacheStats,
} from './prompt-token-counter'
import { buildPreambleSegments } from '@/backend/lib/chat/preamble'

// Per-model file token count cache, keyed by `${fileId}:${model.id}`
const fileTokenCountCache = new LRUCache<string, number>({
  max: Number.parseInt(process.env.TOKEN_ESTIMATOR_FILE_CACHE_MAX_ENTRIES ?? '1000', 10) || 1000,
})

type CacheStats = TokenCountCacheStats

const computePdfNativeTokenCount = async (
  model: LlmModel,
  file: NonNullable<Awaited<ReturnType<typeof getFileWithId>>>,
  analysis: dto.FileAnalysis,
  payload: PdfAnalysisPayload
): Promise<number> => {
  const extractedText = await readExtractedTextFromAnalysis(file, analysis)
  const textTokenCount = countTextForModel(model, normalizeExtractedText(extractedText ?? ''))
  return Math.ceil(
    predictPdfTokenCount(resolvePdfEstimatorModel(model), {
      pageCount: payload.pageCount,
      visionPageCount: payload.visionPageCount,
      textTokenCount,
    })
  )
}

export type TokenEstimateBreakdown = {
  assistant: number
  history: number
  draft: number
  total: number
}

export type TokenEstimateResult = {
  estimate: TokenEstimateBreakdown
  cache: CacheStats
}

type TokenEstimateInput = {
  assistantParams: AssistantParams
  model: LlmModel
  tools: ToolImplementation[]
  parameters: Record<string, ParameterValueAndDescription>
  knowledgeFiles: dto.AssistantFile[]
  history: dto.Message[]
  draftText: string
  attachmentFileIds: string[]
}

const estimateTextFallbackAttachmentTokens = async (
  model: LlmModel,
  fileId: string,
  stats?: CacheStats
): Promise<number> => {
  const file = await getFileWithId(fileId)
  if (!file || file.uploaded !== 1) return 0

  const extractedText = await cachingExtractor.extractFromFile(file)
  const fallbackText = extractedText
    ? `Here is the text content of the file "${file.name}" with id ${file.id}\n${extractedText}`
    : `The content of the file "${file.name}" with id ${file.id} could not be extracted. It is possible that some tools can return the content on demand`

  return countTextTokensCached(model, fallbackText, stats)
}

const getCachedFileTokenCount = (
  fileId: string,
  model: LlmModel,
  stats?: CacheStats
) => {
  const cacheKey = `${fileId}:${model.id}`
  const cached = fileTokenCountCache.get(cacheKey)
  if (cached !== undefined && stats) {
    stats.fileTokenCache.hits++
  }
  if (cached === undefined && stats) {
    stats.fileTokenCache.misses++
  }
  return { cacheKey, cached }
}

const estimateAnalyzedFileTokens = async (
  fileId: string,
  model: LlmModel,
  stats?: CacheStats
): Promise<number> => {
  const { cacheKey, cached } = getCachedFileTokenCount(fileId, model, stats)
  if (cached !== undefined) return cached

  const file = await getFileWithId(fileId)
  if (!file || file.uploaded !== 1) return 0
  const analysis = await ensureFileAnalysis(file)
  if (!isReadyFileAnalysis(analysis)) return 0

  if (isPdfAnalysisPayload(analysis.payload)) {
    if (isPdfOverNativePageLimit(analysis.payload, model)) return 0
    const result = await computePdfNativeTokenCount(model, file, analysis, analysis.payload)
    fileTokenCountCache.set(cacheKey, result)
    return result
  }

  if (!isImageAnalysisPayload(analysis.payload)) return 0
  const result = Math.ceil(
    estimateNativeImageTokensFromDimensions(model, analysis.payload.width, analysis.payload.height)
  )
  fileTokenCountCache.set(cacheKey, result)
  return result
}

const estimateAttachmentTokens = async (
  model: LlmModel,
  attachment: dto.Attachment,
  stats?: CacheStats
): Promise<number> => {
  if (attachment.mimetype === 'application/pdf') {
    if (model.capabilities.supportedMedia?.includes('application/pdf')) {
      const { cacheKey, cached } = getCachedFileTokenCount(attachment.id, model, stats)
      if (cached !== undefined) return cached
      const file = await getFileWithId(attachment.id)
      if (!file || file.uploaded !== 1 || file.type !== 'application/pdf') return 0
      const analysis = await ensureFileAnalysis(file)
      if (!isReadyFileAnalysis(analysis) || !isPdfAnalysisPayload(analysis.payload)) return 0
      if (isPdfOverNativePageLimit(analysis.payload, model)) {
        const courtesyText = getPdfAttachmentPageLimitText(
          attachment,
          analysis.payload.pageCount,
          model
        )
        return courtesyText ? countTextTokensCached(model, courtesyText, stats) : 0
      }
      const result = await computePdfNativeTokenCount(model, file, analysis, analysis.payload)
      fileTokenCountCache.set(cacheKey, result)
      return result
    }
    return estimateTextFallbackAttachmentTokens(model, attachment.id, stats)
  }
  if (model.capabilities.vision && acceptableImageTypes.includes(attachment.mimetype)) {
    return estimateAnalyzedFileTokens(attachment.id, model, stats)
  }
  return countTextTokensCached(
    model,
    JSON.stringify({ filename: attachment.name, mediaType: attachment.mimetype }),
    stats
  )
}


const estimateDtoMessageTokens = async (
  model: LlmModel,
  message: dto.Message,
  stats?: CacheStats
): Promise<number> => {
  if (message.role === 'user') {
    let tokens = countTextTokensCached(model, message.content, stats)
    for (const attachment of message.attachments) {
      tokens += await estimateAttachmentTokens(model, attachment, stats)
    }
    return tokens
  }
  if (message.role === 'assistant') {
    let tokens = 0
    for (const part of message.parts) {
      if (part.type === 'text') {
        tokens += countTextTokensCached(model, part.text, stats)
      } else if (part.type === 'reasoning') {
        tokens += countTextTokensCached(model, part.reasoning, stats)
      } else if (part.type === 'tool-call') {
        tokens += countTextTokensCached(
          model,
          JSON.stringify({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.args }),
          stats
        )
      }
    }
    return tokens
  }
  if (message.role === 'tool') {
    let tokens = 0
    for (const part of message.parts) {
      if (part.type !== 'tool-result') continue
      tokens += countTextTokensCached(
        model,
        JSON.stringify({ toolCallId: part.toolCallId, toolName: part.toolName }),
        stats
      )
      tokens += await countDtoToolResultOutputTokens(model, part.result, stats)
    }
    return tokens
  }
  return 0
}

export const estimateInputTokens = async (
  input: TokenEstimateInput
): Promise<TokenEstimateResult> => {
  const stats: CacheStats = createTokenCountCacheStats()
  const {
    assistantParams,
    model,
    tools,
    parameters,
    history,
    knowledgeFiles,
    draftText,
    attachmentFileIds,
  } = input

  const pendingMessage = await createPendingUserMessage(attachmentFileIds, draftText)

  // Preamble (system prompt, tools, knowledge) — no file bytes loaded
  const preambleSegments = await buildPreambleSegments({
    assistantParams,
    llmModel: model,
    tools,
    parameters,
    knowledge: knowledgeFiles,
  })
  const { assistant } = await countPromptSegmentsTokens(model, preambleSegments, stats)
  const preambleFileTokens = (
    await Promise.all(
      preambleSegments.flatMap((segment) =>
        (segment.analysisFileIds ?? []).map((fileId) => estimateAnalyzedFileTokens(fileId, model, stats))
      )
    )
  ).reduce((sum, value) => sum + value, 0)

  // History — work directly on dto.Message objects, no file bytes loaded
  let historyTokenCount = 0
  for (const message of history) {
    historyTokenCount += await estimateDtoMessageTokens(model, message, stats)
  }

  // Draft message
  const draft = pendingMessage ? await estimateDtoMessageTokens(model, pendingMessage, stats) : 0

  const total = assistant + preambleFileTokens + historyTokenCount + draft

  return {
    estimate: {
      assistant: assistant + preambleFileTokens,
      history: historyTokenCount,
      draft,
      total,
    },
    cache: stats,
  }
}

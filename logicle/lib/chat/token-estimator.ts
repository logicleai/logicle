import * as dto from '@/types/dto'
import { LRUCache } from 'lru-cache'
import { LlmModel } from './models'
import { AssistantParams, ChatAssistant } from '.'
import { ToolImplementation } from './tools'
import { ParameterValueAndDescription } from '@/models/user'
import { getFileWithId } from '@/models/file'
import { ensureFileAnalysis, isReadyFileAnalysis, readExtractedTextFromAnalysis } from '@/lib/fileAnalysis'
import {
  getImageTokenFeatures,
  getPdfTokenFeatures,
  isImageAnalysisPayload,
  isPdfAnalysisPayload,
  isPdfOverNativePageLimit,
} from '@/lib/fileAnalysisPayload'
import { resolvePdfEstimatorModel, predictPdfTokenCount, normalizeExtractedText } from './pdf-token-estimator'
import { acceptableImageTypes } from './conversion'
import { estimateNativeImageTokensFromDimensions } from './image-token-estimator'
import { countTextForModel } from './tokenizer'
import {
  countTextTokensCached,
  countDtoToolResultOutputTokens,
  countPromptSegmentsTokens,
  createPendingUserMessage,
  createTokenCountCacheStats,
  TokenCountCacheStats,
} from './prompt-token-counter'

// Per-model file token count cache, keyed by `${fileId}:${model.id}`
const fileTokenCountCache = new LRUCache<string, number>({
  max: Number.parseInt(process.env.TOKEN_ESTIMATOR_FILE_CACHE_MAX_ENTRIES ?? '1000', 10) || 1000,
})

type CacheStats = TokenCountCacheStats

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
    const pdfFeatures = getPdfTokenFeatures(analysis.payload)
    if (isPdfOverNativePageLimit(analysis.payload, model)) {
      return 0
    }
    const extractedText = await readExtractedTextFromAnalysis(file, analysis)
    const textTokenCount = countTextForModel(model, normalizeExtractedText(extractedText ?? ''))
    const result = Math.ceil(
      predictPdfTokenCount(resolvePdfEstimatorModel(model), {
        pageCount: pdfFeatures.pageCount,
        visionPageCount: pdfFeatures.visionPageCount,
        textTokenCount,
      })
    )
    fileTokenCountCache.set(cacheKey, result)
    return result
  }

  if (!isImageAnalysisPayload(analysis.payload)) return 0
  const imageFeatures = getImageTokenFeatures(analysis.payload)
  const result = Math.ceil(
    estimateNativeImageTokensFromDimensions(model, imageFeatures.width, imageFeatures.height)
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
    const { nativePdfPageLimit, supportedMedia } = model.capabilities
    if (supportedMedia?.includes('application/pdf') && nativePdfPageLimit !== undefined) {
      const file = await getFileWithId(attachment.id)
      if (!file || file.uploaded !== 1 || file.type !== 'application/pdf') {
        return 0
      }
      const analysis = await ensureFileAnalysis(file)
      if (!isReadyFileAnalysis(analysis)) return 0
      if (!isPdfAnalysisPayload(analysis.payload)) {
        return 0
      }
      const pdfFeatures = getPdfTokenFeatures(analysis.payload)
      if (isPdfOverNativePageLimit(analysis.payload, model)) {
        const courtesyText = `The file "${attachment.name}" with id ${attachment.id} could not be sent as an attachment: it has too many pages (${pdfFeatures.pageCount} pages, limit is ${nativePdfPageLimit}). It is possible that some tools can return the content on demand`
        return countTextTokensCached(model, courtesyText, stats)
      }
      return estimateAnalyzedFileTokens(attachment.id, model, stats)
    }
    return 0
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
  const preambleSegments = await ChatAssistant.buildPreambleSegments({
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

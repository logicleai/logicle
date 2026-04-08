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
import { cachingExtractor } from '@/lib/textextraction/cache'
import {
  countTextTokensCached,
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
  const textTokenCount = await countTextTokensCached(model, normalizeExtractedText(extractedText ?? ''))
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

export type ConversationWindowEstimateInput = {
  assistantParams: AssistantParams
  model: LlmModel
  tools: ToolImplementation[]
  parameters: Record<string, ParameterValueAndDescription>
  knowledgeFiles: dto.AssistantFile[]
  history: dto.Message[]
  draft?: dto.UserMessage | null
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
        return courtesyText ? await countTextTokensCached(model, courtesyText, stats) : 0
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

const estimatePromptSegmentsTokens = async (
  model: LlmModel,
  segments: Awaited<ReturnType<typeof buildPreambleSegments>>,
  stats?: CacheStats
): Promise<number> => {
  const { assistant } = await countPromptSegmentsTokens(model, segments, stats)
  const analysisFileTokens = (
    await Promise.all(
      segments.flatMap((segment) =>
        (segment.analysisFileIds ?? []).map((fileId) => estimateAnalyzedFileTokens(fileId, model, stats))
      )
    )
  ).reduce((sum, value) => sum + value, 0)
  return assistant + analysisFileTokens
}

const estimateToolResultOutputTokens = async (
  model: LlmModel,
  output: dto.ToolCallResultOutput,
  stats?: CacheStats
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
          continue
        }
        tokens += await estimateAttachmentTokens(
          model,
          {
            id: item.id,
            mimetype: item.mimetype,
            name: item.name,
            size: item.size,
          },
          stats
        )
      }
      return tokens
    }
  }
}


const estimateDtoMessageTokens = async (
  model: LlmModel,
  message: dto.Message,
  stats?: CacheStats
): Promise<number> => {
  if (message.role === 'user') {
    let tokens = await countTextTokensCached(model, message.content, stats)
    for (const attachment of message.attachments) {
      tokens += await estimateAttachmentTokens(model, attachment, stats)
    }
    return tokens
  }
  if (message.role === 'assistant') {
    let tokens = 0
    for (const part of message.parts) {
      if (part.type === 'text') {
        tokens += await countTextTokensCached(model, part.text, stats)
      } else if (part.type === 'reasoning') {
        tokens += await countTextTokensCached(model, part.reasoning, stats)
      } else if (part.type === 'tool-call') {
        tokens += await countTextTokensCached(
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
      tokens += await countTextTokensCached(
        model,
        JSON.stringify({ toolCallId: part.toolCallId, toolName: part.toolName }),
        stats
      )
      tokens += await estimateToolResultOutputTokens(model, part.result, stats)
    }
    return tokens
  }
  return 0
}

export const estimateHistoryTokens = async (
  model: LlmModel,
  history: dto.Message[],
  stats?: CacheStats
): Promise<number> => {
  let historyTokenCount = 0
  for (const message of history) {
    historyTokenCount += await estimateDtoMessageTokens(model, message, stats)
  }
  return historyTokenCount
}

export const estimatePreambleTokens = async ({
  assistantParams,
  model,
  tools,
  parameters,
  knowledgeFiles,
  stats,
}: {
  assistantParams: AssistantParams
  model: LlmModel
  tools: ToolImplementation[]
  parameters: Record<string, ParameterValueAndDescription>
  knowledgeFiles: dto.AssistantFile[]
  stats?: CacheStats
}): Promise<number> => {
  const preambleSegments = await buildPreambleSegments({
    assistantParams,
    llmModel: model,
    tools,
    parameters,
    knowledge: knowledgeFiles,
  })
  return estimatePromptSegmentsTokens(model, preambleSegments, stats)
}

export const estimateInputTokens = async (
  input: TokenEstimateInput
): Promise<TokenEstimateResult> => {
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

  // Backward-compatible wrapper for callers that still provide draft text/file ids
  // instead of a DTO user message.
  return estimateConversationWindowTokens({
    assistantParams,
    model,
    tools,
    parameters,
    knowledgeFiles,
    history,
    draft: pendingMessage,
  })
}

export const estimateConversationWindowTokens = async (
  input: ConversationWindowEstimateInput
): Promise<TokenEstimateResult> => {
  const stats: CacheStats = createTokenCountCacheStats()
  const { assistantParams, model, tools, parameters, knowledgeFiles, history, draft } = input

  const preambleTokenCount = await estimatePreambleTokens({
    assistantParams,
    model,
    tools,
    parameters,
    knowledgeFiles,
    stats,
  })

  const historyTokenCount = await estimateHistoryTokens(model, history, stats)
  const draftTokenCount = draft ? await estimateDtoMessageTokens(model, draft, stats) : 0

  const total = preambleTokenCount + historyTokenCount + draftTokenCount

  return {
    estimate: {
      assistant: preambleTokenCount,
      history: historyTokenCount,
      draft: draftTokenCount,
      total,
    },
    cache: stats,
  }
}

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
import { estimateNativeImageTokensFromDimensions, nativeImageAlgorithmName } from '@/backend/lib/chat/image-token-estimator'
import { cachingExtractor } from '@/lib/textextraction/cache'
import {
  countTextTokensCached,
  countPromptSegmentsTokens,
  countModelMessageTokens,
  createPendingUserMessage,
  createTokenCountCacheStats,
  TokenCountCacheStats,
} from './prompt-token-counter'
import type * as ai from 'ai'
import { buildPreambleSegments } from '@/backend/lib/chat/preamble'
import { tokenizerForModel } from '@/lib/chat/tokenizer'

// --- File token cache -----------------------------------------------------------

type FileTokenCacheEntry = {
  tokens: number
  algorithm: string
  params?: Record<string, unknown>
}

// Per-model file token count cache, keyed by `${fileId}:${model.id}`
const fileTokenCountCache = new LRUCache<string, FileTokenCacheEntry>({
  max: Number.parseInt(process.env.TOKEN_ESTIMATOR_FILE_CACHE_MAX_ENTRIES ?? '1000', 10) || 1000,
})

type CacheStats = TokenCountCacheStats

// --- Detail collector -----------------------------------------------------------

export interface TokenDetailCollector {
  addPreamblePart(part: dto.TokenDetailPart): void
  addHistoryPart(messageId: string, role: string, part: dto.TokenDetailPart): void
  addDraftPart(part: dto.TokenDetailPart): void
  build(): dto.TokenEstimateDetail
}

export const createTokenDetailCollector = (): TokenDetailCollector => {
  const preamble: dto.TokenDetailPart[] = []
  const historyMap = new Map<string, { role: string; parts: dto.TokenDetailPart[] }>()
  const historyOrder: string[] = []
  const draft: dto.TokenDetailPart[] = []

  return {
    addPreamblePart(part) {
      preamble.push(part)
    },
    addHistoryPart(messageId, role, part) {
      if (!historyMap.has(messageId)) {
        historyMap.set(messageId, { role, parts: [] })
        historyOrder.push(messageId)
      }
      historyMap.get(messageId)!.parts.push(part)
    },
    addDraftPart(part) {
      draft.push(part)
    },
    build() {
      return {
        preamble,
        history: historyOrder.map((id) => {
          const entry = historyMap.get(id)!
          return {
            messageId: id,
            role: entry.role as dto.MessageTokenDetail['role'],
            parts: entry.parts,
          }
        }),
        draft: draft.length > 0 ? draft : undefined,
      }
    },
  }
}

// --- Internal helpers -----------------------------------------------------------

type AttachmentDetailCallback = (
  tokens: number,
  algorithm: string,
  params?: Record<string, unknown>
) => void

const computePdfNativeTokenCount = async (
  model: LlmModel,
  file: NonNullable<Awaited<ReturnType<typeof getFileWithId>>>,
  analysis: dto.FileAnalysis,
  payload: PdfAnalysisPayload
): Promise<FileTokenCacheEntry> => {
  const extractedText = await readExtractedTextFromAnalysis(file, analysis)
  const textTokenCount = await countTextTokensCached(model, normalizeExtractedText(extractedText ?? ''))
  const tokens = Math.ceil(
    predictPdfTokenCount(resolvePdfEstimatorModel(model), {
      pageCount: payload.pageCount,
      visionPageCount: payload.visionPageCount,
      textTokenCount,
    })
  )
  return {
    tokens,
    algorithm: 'pdf_native',
    params: {
      pageCount: payload.pageCount,
      visionPageCount: payload.visionPageCount,
      textTokenCount,
    },
  }
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
  detail?: dto.TokenEstimateDetail
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
): Promise<FileTokenCacheEntry> => {
  const { cacheKey, cached } = getCachedFileTokenCount(fileId, model, stats)
  if (cached !== undefined) return cached

  const file = await getFileWithId(fileId)
  if (!file || file.uploaded !== 1) return { tokens: 0, algorithm: 'none' }
  const analysis = await ensureFileAnalysis(file)
  if (!isReadyFileAnalysis(analysis)) return { tokens: 0, algorithm: 'none' }

  if (isPdfAnalysisPayload(analysis.payload)) {
    if (isPdfOverNativePageLimit(analysis.payload, model)) return { tokens: 0, algorithm: 'none' }
    const entry = await computePdfNativeTokenCount(model, file, analysis, analysis.payload)
    fileTokenCountCache.set(cacheKey, entry)
    return entry
  }

  if (!isImageAnalysisPayload(analysis.payload)) return { tokens: 0, algorithm: 'none' }
  const tokens = Math.ceil(
    estimateNativeImageTokensFromDimensions(model, analysis.payload.width, analysis.payload.height)
  )
  const entry: FileTokenCacheEntry = {
    tokens,
    algorithm: nativeImageAlgorithmName(model),
    params: { width: analysis.payload.width, height: analysis.payload.height },
  }
  fileTokenCountCache.set(cacheKey, entry)
  return entry
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
  ).reduce((sum, entry) => sum + entry.tokens, 0)
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
          { id: item.id, mimetype: item.mimetype, name: item.name, size: item.size },
          stats
        )
      }
      return tokens
    }
  }
}

const estimateAttachmentTokens = async (
  model: LlmModel,
  attachment: dto.Attachment,
  stats?: CacheStats,
  onDetail?: AttachmentDetailCallback
): Promise<number> => {
  const algorithm = tokenizerForModel(model)
  if (attachment.mimetype === 'application/pdf') {
    if (model.capabilities.supportedMedia?.includes('application/pdf')) {
      const { cacheKey, cached } = getCachedFileTokenCount(attachment.id, model, stats)
      if (cached !== undefined) {
        onDetail?.(cached.tokens, cached.algorithm, cached.params)
        return cached.tokens
      }
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
        const tokens = courtesyText ? await countTextTokensCached(model, courtesyText, stats) : 0
        onDetail?.(tokens, 'pdf_page_limit_notice', { pageCount: analysis.payload.pageCount })
        return tokens
      }
      const entry = await computePdfNativeTokenCount(model, file, analysis, analysis.payload)
      fileTokenCountCache.set(cacheKey, entry)
      onDetail?.(entry.tokens, entry.algorithm, entry.params)
      return entry.tokens
    }
    const tokens = await estimateTextFallbackAttachmentTokens(model, attachment.id, stats)
    onDetail?.(tokens, 'pdf_text_fallback')
    return tokens
  }
  if (model.capabilities.vision && acceptableImageTypes.includes(attachment.mimetype)) {
    const entry = await estimateAnalyzedFileTokens(attachment.id, model, stats)
    onDetail?.(entry.tokens, entry.algorithm, entry.params)
    return entry.tokens
  }
  const tokens = await countTextTokensCached(
    model,
    JSON.stringify({ filename: attachment.name, mediaType: attachment.mimetype }),
    stats
  )
  onDetail?.(tokens, algorithm)
  return tokens
}

const estimateDtoMessageTokens = async (
  model: LlmModel,
  message: dto.Message,
  stats?: CacheStats,
  onDetail?: (part: dto.TokenDetailPart) => void
): Promise<number> => {
  const algorithm = tokenizerForModel(model)
  if (message.role === 'user') {
    const textTokens = await countTextTokensCached(model, message.content, stats)
    onDetail?.({ type: 'text', tokens: textTokens, algorithm })
    let tokens = textTokens
    for (const attachment of message.attachments) {
      tokens += await estimateAttachmentTokens(model, attachment, stats, (aTokens, aAlgorithm, aParams) => {
        onDetail?.({
          type: 'attachment',
          id: attachment.id,
          name: attachment.name,
          mimetype: attachment.mimetype,
          tokens: aTokens,
          algorithm: aAlgorithm,
          params: aParams,
        })
      })
    }
    return tokens
  }
  if (message.role === 'assistant') {
    let tokens = 0
    for (const part of message.parts) {
      if (part.type === 'text') {
        const t = await countTextTokensCached(model, part.text, stats)
        onDetail?.({ type: 'text', tokens: t, algorithm })
        tokens += t
      } else if (part.type === 'reasoning') {
        const t = await countTextTokensCached(model, part.reasoning, stats)
        onDetail?.({ type: 'reasoning', tokens: t, algorithm })
        tokens += t
      } else if (part.type === 'tool-call') {
        const t = await countTextTokensCached(
          model,
          JSON.stringify({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.args }),
          stats
        )
        onDetail?.({ type: 'tool_call', toolCallId: part.toolCallId, toolName: part.toolName, tokens: t, algorithm })
        tokens += t
      }
    }
    return tokens
  }
  if (message.role === 'tool') {
    let tokens = 0
    for (const part of message.parts) {
      if (part.type !== 'tool-result') continue
      const metaTokens = await countTextTokensCached(
        model,
        JSON.stringify({ toolCallId: part.toolCallId, toolName: part.toolName }),
        stats
      )
      const resultTokens = await estimateToolResultOutputTokens(model, part.result, stats)
      const partTokens = metaTokens + resultTokens
      onDetail?.({
        type: 'tool_result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        tokens: partTokens,
        algorithm,
      })
      tokens += partTokens
    }
    return tokens
  }
  return 0
}

export const estimateHistoryTokens = async (
  model: LlmModel,
  history: dto.Message[],
  stats?: CacheStats,
  collector?: TokenDetailCollector
): Promise<number> => {
  let historyTokenCount = 0
  for (const message of history) {
    historyTokenCount += await estimateDtoMessageTokens(
      model,
      message,
      stats,
      collector
        ? (part) => collector.addHistoryPart(message.id, message.role, part)
        : undefined
    )
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
  collector,
}: {
  assistantParams: AssistantParams
  model: LlmModel
  tools: ToolImplementation[]
  parameters: Record<string, ParameterValueAndDescription>
  knowledgeFiles: dto.AssistantFile[]
  stats?: CacheStats
  collector?: TokenDetailCollector
}): Promise<number> => {
  const preambleSegments = await buildPreambleSegments({
    assistantParams,
    llmModel: model,
    tools,
    parameters,
    knowledge: knowledgeFiles,
  })
  const total = await estimatePromptSegmentsTokens(model, preambleSegments, stats)

  if (collector) {
    const algorithm = tokenizerForModel(model)

    // System prompt segment is always first
    const systemTokens = await countModelMessageTokens(model, preambleSegments[0].message, stats)
    collector.addPreamblePart({ type: 'system_prompt', tokens: systemTokens, algorithm })

    // Knowledge segment is optional and always second when present
    if (preambleSegments.length > 1) {
      const knowledgeSegment = preambleSegments[1]
      const messageParts = Array.isArray(knowledgeSegment.message.content)
        ? (knowledgeSegment.message.content as unknown[])
        : []

      for (const entry of (knowledgeSegment.knowledgeFileEntries ?? [])) {
        // Try analysis first (works uniformly for images and PDFs with native support).
        // Fall back to counting the message part directly for text/unanalyzed files.
        const analysisEntry = await estimateAnalyzedFileTokens(entry.fileId, model, stats)
        let fileTokens: number
        let fileAlgorithm: string
        let fileParams: Record<string, unknown> | undefined
        if (analysisEntry.tokens > 0) {
          fileTokens = analysisEntry.tokens
          fileAlgorithm = analysisEntry.algorithm
          fileParams = analysisEntry.params
        } else {
          const part = messageParts[entry.partIndex]
          fileTokens = part
            ? await countModelMessageTokens(
                model,
                { role: 'user', content: [part] } as ai.UserModelMessage,
                stats
              )
            : 0
          fileAlgorithm = algorithm
        }
        collector.addPreamblePart({
          type: 'knowledge_file',
          id: entry.fileId,
          name: entry.fileName,
          tokens: fileTokens,
          algorithm: fileAlgorithm,
          params: fileParams,
        })
      }
    }
  }

  return total
}

export const estimateInputTokens = async (
  input: TokenEstimateInput,
  collector?: TokenDetailCollector
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

  return estimateConversationWindowTokens(
    {
      assistantParams,
      model,
      tools,
      parameters,
      knowledgeFiles,
      history,
      draft: pendingMessage,
    },
    collector
  )
}

export const estimateConversationWindowTokens = async (
  input: ConversationWindowEstimateInput,
  collector?: TokenDetailCollector
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
    collector,
  })

  const historyTokenCount = await estimateHistoryTokens(model, history, stats, collector)
  const draftTokenCount = draft
    ? await estimateDtoMessageTokens(
        model,
        draft,
        stats,
        collector ? (part) => collector.addDraftPart(part) : undefined
      )
    : 0

  const total = preambleTokenCount + historyTokenCount + draftTokenCount

  return {
    estimate: {
      assistant: preambleTokenCount,
      history: historyTokenCount,
      draft: draftTokenCount,
      total,
    },
    cache: stats,
    detail: collector?.build(),
  }
}

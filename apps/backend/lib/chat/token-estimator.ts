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
  canSendAsNativeFile,
  canSendAsNativeImage,
  getPdfAttachmentPageLimitText,
} from '@/backend/lib/chat/file-attachment-policy'
import { estimateNativeImageTokensFromDimensions, nativeImageAlgorithmName } from '@/backend/lib/chat/image-token-estimator'
import { cachingExtractor } from '@/lib/textextraction/cache'
import {
  countTextTokensCached,
  countModelMessageTokens,
  createPendingUserMessage,
  createTokenCountCacheStats,
  TokenCountCacheStats,
} from './prompt-token-counter'
import type * as ai from 'ai'
import { buildEstimatedPreambleSegments, preparePreamblePlan, PreamblePlan } from '@/backend/lib/chat/preamble'
import { tokenizerForModel } from '@/lib/chat/tokenizer'
import {
  projectMessageForEstimation,
} from '@/backend/lib/chat/conversion'

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

export type HistoryMessageCost = {
  messageId: string
  role: dto.Message['role']
  tokens: number
}

export type ConversationCostPlan = {
  assistantTokens: number
  historyMessageCosts: HistoryMessageCost[]
  draftTokens: number
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
  if (!file || !file.fileBlobId) return { tokens: 0, algorithm: 'none' }
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
  if (!file || !file.fileBlobId) return 0

  const extractedText = await cachingExtractor.extractFromFile(file)
  const fallbackText = extractedText
    ? `Here is the text content of the file "${file.name}" with id ${file.id}\n${extractedText}`
    : `The content of the file "${file.name}" with id ${file.id} could not be extracted. It is possible that some tools can return the content on demand`

  return countTextTokensCached(model, fallbackText, stats)
}

const estimateKnowledgeFileTokens = async (
  fileId: string,
  fileName: string,
  mimetype: string,
  partIndex: number,
  messageParts: unknown[],
  model: LlmModel,
  stats?: CacheStats
): Promise<FileTokenCacheEntry> => {
  const analysisEntry = await estimateAnalyzedFileTokens(fileId, model, stats)
  if (analysisEntry.tokens > 0) return analysisEntry
  const part = messageParts[partIndex]
  const tokens = part
    ? await countModelMessageTokens(
        model,
        { role: 'user', content: [part] } as ai.UserModelMessage,
        stats
      )
    : 0
  if (part) return { tokens, algorithm: tokenizerForModel(model) }
  if (mimetype === 'application/pdf') {
    const pdfTokens = await estimateAttachmentTokens(
      model,
      { id: fileId, name: fileName, mimetype, size: 0 },
      stats
    )
    return { tokens: pdfTokens, algorithm: tokenizerForModel(model) }
  }
  if (canSendAsNativeImage(mimetype, model.capabilities) || canSendAsNativeFile(mimetype, model.capabilities)) {
    return { tokens: 0, algorithm: 'none' }
  }
  const fallbackTokens = await estimateTextFallbackAttachmentTokens(model, fileId, stats)
  return { tokens: fallbackTokens, algorithm: 'text_fallback' }
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
      if (!file || !file.fileBlobId || file.type !== 'application/pdf') return 0
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
  const projected = projectMessageForEstimation(message)
  if (projected.role === 'ignored') return 0
  let tokens = 0
  for (const item of projected.items) {
    if (item.kind === 'text') {
      const t = await countTextTokensCached(model, item.text, stats)
      onDetail?.({
        type: item.source === 'assistant_reasoning' ? 'reasoning' : 'text',
        tokens: t,
        algorithm,
        params: item.source ? { source: item.source } : undefined,
      })
      tokens += t
      continue
    }
    if (item.kind === 'attachment') {
      tokens += await estimateAttachmentTokens(model, item.attachment, stats, (aTokens, aAlgorithm, aParams) => {
        onDetail?.({
          type: 'attachment',
          id: item.attachment.id,
          name: item.attachment.name,
          mimetype: item.attachment.mimetype,
          tokens: aTokens,
          algorithm: aAlgorithm,
          params: aParams,
        })
      })
      continue
    }
    if (item.kind === 'tool_call') {
      const t = await countTextTokensCached(model, JSON.stringify(item.payload), stats)
      onDetail?.({ type: 'tool_call', toolCallId: item.toolCallId, toolName: item.toolName, tokens: t, algorithm })
      tokens += t
      continue
    }
    const metaTokens = await countTextTokensCached(
      model,
      JSON.stringify(item.metaPayload),
      stats
    )
    const resultTokens = await estimateToolResultOutputTokens(model, item.output, stats)
    const partTokens = metaTokens + resultTokens
    onDetail?.({
      type: 'tool_result',
      toolCallId: item.toolCallId,
      toolName: item.toolName,
      tokens: partTokens,
      algorithm,
    })
    tokens += partTokens
  }
  return tokens
}

export const estimateHistoryMessageCosts = async (
  model: LlmModel,
  history: dto.Message[],
  stats?: CacheStats,
  collector?: TokenDetailCollector
): Promise<HistoryMessageCost[]> => {
  const costs: HistoryMessageCost[] = []
  for (let index = 0; index < history.length; index++) {
    const message = history[index]!
    const tokens = await estimateDtoMessageTokens(
      model,
      message,
      stats,
      collector ? (part) => collector.addHistoryPart(message.id, message.role, part) : undefined
    )
    costs.push({ messageId: message.id, role: message.role, tokens })
  }
  return costs
}

export const computeConversationPlanTotalCost = (plan: ConversationCostPlan): number =>
  plan.assistantTokens + plan.draftTokens + plan.historyMessageCosts.reduce((sum, entry) => sum + entry.tokens, 0)

export const selectOptimalHistoryStartIndex = (
  history: dto.Message[],
  historyMessageCosts: HistoryMessageCost[],
  assistantTokens: number,
  draftTokens: number,
  tokenLimit: number
): number => {
  if (history.length === 0) return 0
  const running: number[] = new Array(historyMessageCosts.length + 1).fill(0)
  for (let i = historyMessageCosts.length - 1; i >= 0; i--) {
    running[i] = running[i + 1]! + (historyMessageCosts[i]?.tokens ?? 0)
  }
  const userTurnStartIndexes = history.flatMap((message, index) =>
    message.role === 'user' && index > 0 ? [index] : []
  )
  const candidateStartIndexes = [0, ...userTurnStartIndexes]
  for (const startIndex of candidateStartIndexes) {
    const total = assistantTokens + draftTokens + (running[startIndex] ?? 0)
    if (total <= tokenLimit) return startIndex
  }
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]?.role === 'user') return index
  }
  return 0
}

export const prepareConversationCostPlan = async (
  input: ConversationWindowEstimateInput,
  collector?: TokenDetailCollector
): Promise<{ plan: ConversationCostPlan; cache: CacheStats }> => {
  const stats: CacheStats = createTokenCountCacheStats()
  const { assistantParams, model, tools, parameters, knowledgeFiles, history, draft } = input
  const preamblePlan = await preparePreamblePlan({
    assistantParams,
    llmModel: model,
    tools,
    parameters,
    knowledge: knowledgeFiles,
  })
  const assistantTokens = await estimatePreambleTokensFromPlan({
    plan: preamblePlan,
    model,
    stats,
    collector,
  })
  const historyMessageCosts = await estimateHistoryMessageCosts(model, history, stats, collector)
  const draftTokens = draft
    ? await estimateDtoMessageTokens(
        model,
        draft,
        stats,
        collector ? (part) => collector.addDraftPart(part) : undefined
      )
    : 0
  return {
    plan: {
      assistantTokens,
      historyMessageCosts,
      draftTokens,
    },
    cache: stats,
  }
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
  const preamblePlan = await preparePreamblePlan({
    assistantParams,
    llmModel: model,
    tools,
    parameters,
    knowledge: knowledgeFiles,
  })
  return estimatePreambleTokensFromPlan({ plan: preamblePlan, model, stats, collector })
}

export const estimatePreambleTokensFromPlan = async ({
  plan,
  model,
  stats,
  collector,
}: {
  plan: PreamblePlan
  model: LlmModel
  stats?: CacheStats
  collector?: TokenDetailCollector
}): Promise<number> => {
  const preambleSegments = buildEstimatedPreambleSegments(plan)
  if (preambleSegments.length === 0) return 0

  const algorithm = tokenizerForModel(model)

  // System prompt is always the first segment
  const systemTokens = await countModelMessageTokens(model, preambleSegments[0].message, stats)
  collector?.addPreamblePart({ type: 'system_prompt', tokens: systemTokens, algorithm })

  // Knowledge segment is optional and always second when present
  let knowledgeTokens = 0
  if (preambleSegments.length > 1) {
    const knowledgeSegment = preambleSegments[1]
    const messageParts = Array.isArray(knowledgeSegment.message.content)
      ? (knowledgeSegment.message.content as unknown[])
      : []
    for (const entry of (knowledgeSegment.knowledgeFileEntries ?? [])) {
      const fileEntry = await estimateKnowledgeFileTokens(
        entry.fileId, entry.fileName, entry.mimetype, entry.partIndex, messageParts, model, stats
      )
      knowledgeTokens += fileEntry.tokens
      collector?.addPreamblePart({
        type: 'knowledge_file',
        id: entry.fileId,
        name: entry.fileName,
        tokens: fileEntry.tokens,
        algorithm: fileEntry.algorithm,
        params: fileEntry.params,
      })
    }
  }

  // Legacy: count any analysisFileIds not covered by knowledgeFileEntries above
  // (e.g. segments produced by custom/mocked preamble builders)
  const coveredFileIds = new Set(
    preambleSegments.flatMap((seg) => (seg.knowledgeFileEntries ?? []).map((e) => e.fileId))
  )
  for (const segment of preambleSegments) {
    for (const fileId of (segment.analysisFileIds ?? [])) {
      if (coveredFileIds.has(fileId)) continue
      const entry = await estimateAnalyzedFileTokens(fileId, model, stats)
      knowledgeTokens += entry.tokens
      collector?.addPreamblePart({
        type: 'knowledge_file',
        id: fileId,
        tokens: entry.tokens,
        algorithm: entry.algorithm,
        params: entry.params,
      })
    }
  }

  return systemTokens + knowledgeTokens
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
  const { plan, cache } = await prepareConversationCostPlan(input, collector)
  const historyTokenCount = plan.historyMessageCosts.reduce((sum, entry) => sum + entry.tokens, 0)
  const total = computeConversationPlanTotalCost(plan)

  return {
    estimate: {
      assistant: plan.assistantTokens,
      history: historyTokenCount,
      draft: plan.draftTokens,
      total,
    },
    cache,
    detail: collector?.build(),
  }
}

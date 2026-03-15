import * as dto from '@/types/dto'
import { LRUCache } from 'lru-cache'
import { LlmModel } from './models'
import { AssistantParams, ChatAssistant } from '.'
import { ToolImplementation } from './tools'
import { ParameterValueAndDescription } from '@/models/user'
import { getFileWithId } from '@/models/file'
import { getFileAnalysis } from '@/models/fileAnalysis'
import { ensureFileAnalysis, ensurePdfAnalysis, readExtractedTextFromAnalysis } from '@/lib/fileAnalysis'
import { resolvePdfEstimatorModel, predictPdfTokenCount, normalizeExtractedText } from './pdf-token-estimator'
import { acceptableImageTypes } from './conversion'
import { estimateNativeImageTokensFromDimensions } from './image-token-estimator'
import { countTextForModel } from './tokenizer'
import {
  countTextTokensCached,
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

const estimatePdfTokensForFile = async (
  fileId: string,
  model: LlmModel
): Promise<number> => {
  const cacheKey = `${fileId}:${model.id}`
  const cached = fileTokenCountCache.get(cacheKey)
  if (cached !== undefined) return cached

  const file = await getFileWithId(fileId)
  if (!file || file.uploaded !== 1 || file.type !== 'application/pdf') {
    return 0
  }
  const analysis = await ensurePdfAnalysis(file)
  if (analysis?.status !== 'ready' || analysis.payload?.kind !== 'pdf') {
    return 0
  }
  const { nativePdfPageLimit } = model.capabilities
  if (nativePdfPageLimit !== undefined && analysis.payload.pageCount > nativePdfPageLimit) {
    return 0 // over limit: replaced by courtesy text counted in estimateAttachmentTokens
  }
  const extractedText = await readExtractedTextFromAnalysis(file, analysis)
  const textTokenCount = countTextForModel(model, normalizeExtractedText(extractedText ?? ''))
  const result = Math.ceil(
    predictPdfTokenCount(resolvePdfEstimatorModel(model), {
      pageCount: analysis.payload.pageCount,
      visionPageCount: analysis.payload.visionPageCount,
      textTokenCount,
    })
  )
  fileTokenCountCache.set(cacheKey, result)
  return result
}

const estimateImageTokensForFile = async (
  fileId: string,
  model: LlmModel
): Promise<number> => {
  const cacheKey = `${fileId}:${model.id}`
  const cached = fileTokenCountCache.get(cacheKey)
  if (cached !== undefined) return cached

  const file = await getFileWithId(fileId)
  if (!file || file.uploaded !== 1) return 0
  const analysis = await ensureFileAnalysis(file)
  if (analysis?.status !== 'ready' || analysis.payload?.kind !== 'image') return 0
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
    const { nativePdfPageLimit, supportedMedia } = model.capabilities
    if (supportedMedia?.includes('application/pdf') && nativePdfPageLimit !== undefined) {
      // Analysis was already fetched by estimatePdfTokensForFile — plain DB lookup
      const analysis = await getFileAnalysis(attachment.id)
      if (analysis?.status === 'ready' && analysis.payload?.kind === 'pdf' &&
          analysis.payload.pageCount > nativePdfPageLimit) {
        const courtesyText = `The file "${attachment.name}" with id ${attachment.id} could not be sent as an attachment: it has too many pages (${analysis.payload.pageCount} pages, limit is ${nativePdfPageLimit}). It is possible that some tools can return the content on demand`
        return countTextTokensCached(model, courtesyText, stats)
      }
    }
    return 0 // within limit: counted separately via pdfTokens
  }
  if (model.capabilities.vision && acceptableImageTypes.includes(attachment.mimetype)) {
    return estimateImageTokensForFile(attachment.id, model)
  }
  return countTextTokensCached(
    model,
    JSON.stringify({ filename: attachment.name, mediaType: attachment.mimetype }),
    stats
  )
}

const estimateDtoToolOutputTokens = async (
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
          tokens += countTextTokensCached(model, item.text, stats)
        } else if (item.type === 'file') {
          tokens += countTextTokensCached(
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
      tokens += await estimateDtoToolOutputTokens(model, part.result, stats)
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

  const historicalPdfIds = history
    .filter((m): m is dto.UserMessage => m.role === 'user')
    .flatMap((m) => m.attachments.filter((a) => a.mimetype === 'application/pdf').map((a) => a.id))

  const pdfFileIds = [
    ...attachmentFileIds,
    ...knowledgeFiles.map((file) => file.id),
    ...historicalPdfIds,
  ]
  const pdfTokenCounts = await Promise.all(
    [...new Set(pdfFileIds)].map((fileId) => estimatePdfTokensForFile(fileId, model))
  )
  const pdfTokens = pdfTokenCounts.reduce((sum, n) => sum + n, 0)

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

  // History — work directly on dto.Message objects, no file bytes loaded
  let historyTokenCount = 0
  for (const message of history) {
    historyTokenCount += await estimateDtoMessageTokens(model, message, stats)
  }

  // Draft message
  const draft = pendingMessage ? await estimateDtoMessageTokens(model, pendingMessage, stats) : 0

  const total = assistant + historyTokenCount + draft + pdfTokens

  return {
    estimate: {
      assistant,
      history: historyTokenCount,
      draft,
      total,
    },
    cache: stats,
  }
}

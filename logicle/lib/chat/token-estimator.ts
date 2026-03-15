import * as dto from '@/types/dto'
import { LlmModel } from './models'
import { AssistantParams, ChatAssistant } from '.'
import { ToolImplementation } from './tools'
import { ParameterValueAndDescription } from '@/models/user'
import { getFileWithId } from '@/models/file'
import { ensurePdfAnalysis, readExtractedTextFromAnalysis } from '@/lib/fileAnalysis'
import { resolvePdfEstimatorModel, predictPdfTokenCount, normalizeExtractedText } from './pdf-token-estimator'
import { countTextForModel } from './tokenizer'
import {
  countPromptSegmentsTokens,
  createPendingUserMessage,
  createTokenCountCacheStats,
  TokenCountCacheStats,
} from './prompt-token-counter'

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
  const file = await getFileWithId(fileId)
  if (!file || file.uploaded !== 1 || file.type !== 'application/pdf') {
    return 0
  }
  const analysis = await ensurePdfAnalysis(file)
  if (analysis?.status !== 'ready' || analysis.payload?.kind !== 'pdf') {
    return 0
  }
  const extractedText = await readExtractedTextFromAnalysis(file, analysis)
  const textTokenCount = countTextForModel(model, normalizeExtractedText(extractedText ?? ''))
  return Math.ceil(
    predictPdfTokenCount(resolvePdfEstimatorModel(model), {
      pageCount: analysis.payload.pageCount,
      visionPageCount: analysis.payload.visionPageCount,
      textTokenCount,
    })
  )
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
  const segments = await ChatAssistant.buildPromptSegments({
    assistantParams,
    llmModel: model,
    tools,
    parameters,
    knowledge: knowledgeFiles,
    messages: pendingMessage ? [...history, pendingMessage] : history,
    draftMessageId: pendingMessage?.id,
  })
  const { assistant, history: historyTokenCount, draft } = await countPromptSegmentsTokens(
    model,
    segments,
    stats
  )
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

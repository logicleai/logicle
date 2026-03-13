import * as dto from '@/types/dto'
import { LlmModel } from './models'
import { AssistantParams, ChatAssistant } from '.'
import { ToolImplementation } from './tools'
import { ParameterValueAndDescription } from '@/models/user'
import { getFileWithId } from '@/models/file'
import { primePdfTokenEstimatorCacheForFile } from '@/lib/fileAnalysis'
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

  const pdfFileIds = [
    ...attachmentFileIds,
    ...knowledgeFiles.map((file) => file.id),
  ]
  await Promise.all(
    [...new Set(pdfFileIds)].map(async (fileId) => {
      const file = await getFileWithId(fileId)
      if (!file || file.uploaded !== 1 || file.type !== 'application/pdf') {
        return
      }
      await primePdfTokenEstimatorCacheForFile(file)
    })
  )

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
  const total = assistant + historyTokenCount + draft

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

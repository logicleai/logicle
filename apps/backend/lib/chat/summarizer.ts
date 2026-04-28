import * as ai from 'ai'
import * as dto from '@/types/dto'
import { LanguageModelV3 } from '@ai-sdk/provider'
import env from '@/lib/env'
import { logger } from '@/lib/logging'
import { llmModels } from '@/lib/models'
import { createLanguageModel } from './provider-factory'

export async function computeSafeSummary(text: string): Promise<string> {
  const maxLen = 128
  const newlineIndex = text.indexOf('\n')
  const firstLine = newlineIndex !== -1 ? text.substring(0, newlineIndex) : text
  return firstLine.length > maxLen ? `${firstLine.substring(0, maxLen)}...` : firstLine
}

export async function findReasonableSummarizationBackend(): Promise<LanguageModelV3 | undefined> {
  if (env.chat.autoSummary.useChatBackend) return undefined

  const providerScore = (provider: { providerType: string }) => {
    if (provider.providerType === 'logiclecloud') return 3
    else if (provider.providerType === 'openai') return 2
    else if (provider.providerType === 'anthropic') return 1
    else if (provider.providerType === 'gcp-vertex') return 0
    else return -1
  }
  const modelScore = (modelId: string) => {
    if (modelId.startsWith('gpt-4o-mini')) return 2
    else if (modelId.startsWith('claude-3-5-sonnet')) return 1
    else if (modelId.startsWith('gemini-1.5-flash')) return 0
    else return -1
  }

  const { getBackends } = await import('@/models/backend')
  const backends = await getBackends()
  if (backends.length === 0) return undefined

  const bestBackend = backends.reduce((maxItem: any, currentItem: any) =>
    providerScore(currentItem) > providerScore(maxItem) ? currentItem : maxItem
  )
  const models = llmModels.filter((m) => m.provider === bestBackend.providerType)
  if (models.length === 0) return undefined

  const bestModel = models.reduce((maxItem, currentItem) =>
    modelScore(currentItem.id) > modelScore(maxItem.id) ? currentItem : maxItem
  )
  return createLanguageModel(bestBackend, bestModel)
}

export async function summarize(
  userMsg: dto.Message,
  assistantMsg: dto.Message,
  currentLanguageModel: LanguageModelV3,
  userLanguage?: string,
  maxLength?: number
): Promise<string | undefined> {
  function truncateStrings<T>(obj: T, max: number): T {
    if (typeof obj === 'string') {
      return (obj.length > max ? `${obj.slice(0, max)}…` : obj) as any
    } else if (Array.isArray(obj)) {
      return obj.map((item) => truncateStrings(item, max)) as any
    } else if (obj !== null && typeof obj === 'object') {
      const clone: any = {}
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        clone[key] = truncateStrings(value as any, max)
      }
      return clone
    }
    return obj
  }

  const croppedMessages = [userMsg, assistantMsg].map((msg) =>
    truncateStrings(msg, maxLength ?? env.chat.autoSummary.maxLength)
  )

  const messages: ai.ModelMessage[] = [
    {
      role: 'system',
      content: `The user will provide a chat in JSON format. Reply with a title, at most three words. The user preferred language for the title is "${userLanguage}". If this preference is not valid, you may use the same language of the messages of the conversion. Be very concise: no apices, nor preamble`,
    },
    {
      role: 'user',
      content: JSON.stringify(croppedMessages),
    },
  ]

  const languageModel = (await findReasonableSummarizationBackend()) ?? currentLanguageModel

  const result = ai.streamText({
    model: languageModel,
    messages,
    tools: undefined,
    temperature: 0,
  })
  let summary = ''
  for await (const chunk of result.textStream) {
    summary += chunk
  }
  return computeSafeSummary(summary)
}

export async function generateAndSendSummary(
  chatHistory: dto.Message[],
  currentLanguageModel: LanguageModelV3,
  userLanguage: string | undefined,
  updateChatTitle: (title: string) => Promise<void>,
  enqueue: (part: dto.TextStreamPart) => void
): Promise<void> {
  if (chatHistory.length < 2) return
  try {
    const text = await summarize(chatHistory[0], chatHistory[1], currentLanguageModel, userLanguage)
    if (text) {
      await updateChatTitle(text)
      try {
        enqueue({ type: 'summary', summary: text })
      } catch (e) {
        logger.error(`Failed sending summary: ${e}`)
      }
    } else {
      logger.error('Summary generaton failed, leaving summary to the default value')
    }
  } catch (e) {
    logger.error(`Failed generating summary: ${e}`)
  }
}

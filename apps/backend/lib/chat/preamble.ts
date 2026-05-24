import * as ai from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import { LlmModel } from '@/lib/chat/models'
import { ToolImplementation } from '@/lib/chat/tools'
import type { ParameterValueAndDescription } from '@/models/user'
import { dtoMessageToLlmMessage, sanitizeOrphanToolCalls } from '@/backend/lib/chat/conversion'
import { fileDescriptorText } from '@/backend/lib/chat/message-projection'

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

type AssistantParamsLike = {
  systemPrompt: string
}

export type KnowledgeFileEntry = {
  fileId: string
  fileName: string
  mimetype: string
  size: number
  partIndex: number
}

export type PromptSegment = {
  scope: 'prompt' | 'history' | 'draft'
  message: ai.ModelMessage
  analysisFileIds?: string[]
  knowledgeFileEntries?: KnowledgeFileEntry[]
}

export type PreamblePlan = {
  systemPromptMessage: ai.SystemModelMessage
  knowledgePrompt?: string
  knowledgeFileEntries?: KnowledgeFileEntry[]
  intersperseFileMetadata?: boolean
  materializeKnowledgeSegment?: () => Promise<{
    message: ai.UserModelMessage
    analysisFileIds: string[]
  } | null>
}

export function fillTemplate(
  template: string,
  values: Record<string, ParameterValueAndDescription>
): string {
  const placeholderRegex = /\{\{\s*([^}.]+?)(?:\.(\w+))?\s*\}\}/g

  return template.replace(placeholderRegex, (_match, key: string, subKey?: string) => {
    const k = key.trim()
    if (!(k in values) || values[k] === undefined || values[k] === null) {
      return _match
    }
    if (subKey === 'description') {
      return values[k].description
    } else if (subKey === undefined) {
      return values[k].value ?? values[k].defaultValue ?? _match
    } else {
      return _match
    }
  })
}

export async function computeSystemPrompt(
  assistantParams: AssistantParamsLike,
  tools: ToolImplementation[],
  parameters: Record<string, ParameterValueAndDescription>
): Promise<ai.SystemModelMessage> {
  const userSystemPrompt = assistantParams.systemPrompt ?? ''
  const attachmentSystemPrompt = `
      Files uploaded by the user are described in the conversation. 
      They are listed in the message to which they are attached. The content, if possible, is in the message. They can also be retrieved or processed by means of function calls referring to their id.
    `
  const promptFragments = [
    assistantParams.systemPrompt,
    ...tools.map((t) => t.toolParams.promptFragment),
  ].filter((f) => f.length !== 0)

  const systemPrompt = fillTemplate(
    `${userSystemPrompt}${attachmentSystemPrompt}${promptFragments}`,
    parameters
  )

  return {
    role: 'system',
    content: systemPrompt,
  }
}

export async function withBuiltinTools(tools: ToolImplementation[], llmModel: LlmModel): Promise<ToolImplementation[]> {
  if (!(llmModel.capabilities.knowledge ?? true)) {
    return tools
  }
  const { KnowledgePlugin } = await import('@/backend/lib/tools/knowledge/implementation')
  // Only add the plugin when sendInPrompt is off — that is the only mode where
  // the plugin exposes an active function (GetFile) to the LLM. When sendInPrompt
  // is on, knowledge content is injected directly into the prompt; the plugin
  // contributes nothing as a tool.
  if (env.knowledge.sendInPrompt) {
    return tools
  }
  return [
    ...tools,
    new KnowledgePlugin({ id: 'knowledge', provisioned: false, promptFragment: '', name: 'knowledge' }, {}),
  ]
}

export async function buildPreambleSegments({
  assistantParams,
  llmModel,
  tools,
  parameters,
  knowledge,
}: {
  assistantParams: AssistantParamsLike
  llmModel: LlmModel
  tools: ToolImplementation[]
  parameters: Record<string, ParameterValueAndDescription>
  knowledge: dto.AssistantFile[]
}): Promise<PromptSegment[]> {
  const plan = await preparePreamblePlan({ assistantParams, llmModel, tools, parameters, knowledge })
  return renderPreamblePlan(plan)
}

const knowledgeFileSelectionNotice =
  `When the user requests to gather information from unspecified files, ` +
  `he's referring to files attached in the same message, so **do not mention / use the knowledge if it's not useful to answer the user question**.`

export async function preparePreamblePlan({
  assistantParams,
  llmModel,
  tools,
  parameters,
  knowledge,
}: {
  assistantParams: AssistantParamsLike
  llmModel: LlmModel
  tools: ToolImplementation[]
  parameters: Record<string, ParameterValueAndDescription>
  knowledge: dto.AssistantFile[]
}): Promise<PreamblePlan> {
  const resolvedTools = await withBuiltinTools(tools, llmModel)
  const systemPromptMessage = await computeSystemPrompt(assistantParams, resolvedTools, parameters)
  if (knowledge.length === 0 || !env.knowledge.sendInPrompt) {
    return { systemPromptMessage }
  }
  const { loadKnowledgeFilePart } = await import('@/backend/lib/tools/knowledge/implementation')

  const intersperse = env.knowledge.intersperseFileMetadata

  const knowledgePrompt = intersperse
    ? `Assistant knowledge files are embedded in this conversation, each preceded by a brief descriptor.\n${knowledgeFileSelectionNotice}`
    : `More files are available as assistant knowledge. These files can be retrieved or processed by function calls referring to their id.\nHere is the assistant knowledge:\n${JSON.stringify(knowledge)}\n${knowledgeFileSelectionNotice}`

  const knowledgeFileEntries: KnowledgeFileEntry[] = knowledge.map((k, index) => ({
    fileId: k.id,
    fileName: k.name,
    mimetype: k.type,
    size: k.size,
    partIndex: intersperse ? index * 2 + 1 : index,
  }))

  return {
    systemPromptMessage,
    knowledgePrompt,
    knowledgeFileEntries,
    intersperseFileMetadata: intersperse || undefined,
    // Limit concurrency to avoid saturating the libuv thread pool and the Node.js microtask queue
    // when an assistant has many knowledge files — unbounded Promise.all causes multi-second stalls.
    materializeKnowledgeSegment: async () => {
      const indexed = knowledge.map((k, i) => ({ k, i }))
      const loaded = await mapWithConcurrency(
        indexed,
        async ({ k, i }) => ({
          fileId: k.id,
          descriptor: intersperse
            ? fileDescriptorText(k.name, k.id, k.type, k.size, i + 1, 'Knowledge')
            : null,
          content: await loadKnowledgeFilePart(k, llmModel),
        }),
        8
      )
      const parts: (ai.TextPart | ai.ImagePart | ai.FilePart)[] = []
      const analysisFileIds: string[] = []
      for (const { fileId, descriptor, content } of loaded) {
        if (descriptor) parts.push({ type: 'text', text: descriptor })
        parts.push(content)
        if (content.type === 'file') analysisFileIds.push(fileId)
      }
      return { message: { role: 'user', content: parts }, analysisFileIds }
    },
  }
}

export function buildEstimatedPreambleSegments(plan: PreamblePlan): PromptSegment[] {
  const segments: PromptSegment[] = [
    {
      scope: 'prompt',
      message: plan.knowledgePrompt
        ? {
            ...plan.systemPromptMessage,
            content: `${plan.systemPromptMessage.content}${plan.knowledgePrompt}`,
          }
        : plan.systemPromptMessage,
    },
  ]
  if (plan.knowledgeFileEntries) {
    segments.push({
      scope: 'prompt',
      message: { role: 'user', content: [] },
      knowledgeFileEntries: plan.knowledgeFileEntries,
    })
  }
  return segments
}

export async function renderPreamblePlan(
  plan: PreamblePlan
): Promise<PromptSegment[]> {
  const segments = buildEstimatedPreambleSegments(plan)
  if (!plan.knowledgeFileEntries) {
    return segments
  }
  if (!plan.materializeKnowledgeSegment) {
    return segments
  }
  const renderedKnowledge = await plan.materializeKnowledgeSegment()
  if (!renderedKnowledge) return segments
  segments[1] = {
    scope: 'prompt',
    message: renderedKnowledge.message,
    analysisFileIds: renderedKnowledge.analysisFileIds,
    knowledgeFileEntries: plan.knowledgeFileEntries,
  }
  return segments
}

export async function buildHistorySegments(
  messages: dto.Message[],
  llmModel: LlmModel,
  languageModel: LanguageModelV3,
  draftMessageId?: string,
  cache?: Map<string, ai.ModelMessage>
): Promise<PromptSegment[]> {
  const convertedMessages = (
    await Promise.all(
      messages.map(async (message) => {
        let converted = cache?.get(message.id)
        if (!converted) {
          converted =
            (await dtoMessageToLlmMessage(message, llmModel.capabilities, languageModel.provider)) ??
            undefined
          if (converted && cache) cache.set(message.id, converted)
        }
        return converted
          ? {
              scope: message.id === draftMessageId ? ('draft' as const) : ('history' as const),
              message: converted,
            }
          : undefined
      })
    )
  ).filter((entry) => entry !== undefined) as Array<{
    scope: 'history' | 'draft'
    message: ai.ModelMessage
  }>
  return sanitizeOrphanToolCalls(convertedMessages.map((entry) => entry.message)).map(
    (message, index) => ({
      scope: convertedMessages[index]?.scope ?? 'history',
      message,
    })
  )
}

export async function buildPromptSegments({
  assistantParams,
  llmModel,
  languageModel,
  tools,
  parameters,
  knowledge,
  messages,
  draftMessageId,
}: {
  assistantParams: AssistantParamsLike
  llmModel: LlmModel
  languageModel: LanguageModelV3
  tools: ToolImplementation[]
  parameters: Record<string, ParameterValueAndDescription>
  knowledge: dto.AssistantFile[]
  messages: dto.Message[]
  draftMessageId?: string
}): Promise<PromptSegment[]> {
  const preamble = await buildPreambleSegments({ assistantParams, llmModel, tools, parameters, knowledge })
  const history = await buildHistorySegments(messages, llmModel, languageModel, draftMessageId)
  return [...preamble, ...history]
}

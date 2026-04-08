import * as ai from 'ai'
import { LanguageModelV3 } from '@ai-sdk/provider'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import { LlmModel } from '@/lib/chat/models'
import { ToolImplementation } from '@/lib/chat/tools'
import type { ParameterValueAndDescription } from '@/models/user'
import { dtoMessageToLlmMessage, sanitizeOrphanToolCalls } from '@/backend/lib/chat/conversion'

type AssistantParamsLike = {
  systemPrompt: string
}

export type KnowledgeFileEntry = {
  fileId: string
  fileName: string
  partIndex: number
}

export type PromptSegment = {
  scope: 'prompt' | 'history' | 'draft'
  message: ai.ModelMessage
  analysisFileIds?: string[]
  knowledgeFileEntries?: KnowledgeFileEntry[]
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

export async function withBuiltinTools(tools: ToolImplementation[], llmModel: LlmModel) {
  if (!(llmModel.capabilities.knowledge ?? true)) {
    return tools
  }
  const { KnowledgePlugin } = await import('@/backend/lib/tools/knowledge/implementation')
  return [
    ...tools,
    new KnowledgePlugin(
      {
        id: 'knowledge',
        provisioned: false,
        promptFragment: '',
        name: 'knowledge',
      },
      {}
    ),
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
  const { KnowledgePlugin } = await import('@/backend/lib/tools/knowledge/implementation')
  const resolvedTools = await withBuiltinTools(tools, llmModel)
  const systemPromptMessage = await computeSystemPrompt(assistantParams, resolvedTools, parameters)
  const segments: PromptSegment[] = [{ scope: 'prompt', message: systemPromptMessage }]

  if (knowledge.length > 0 && env.knowledge.sendInPrompt) {
    const knowledgePrompt = `
      More files are available as assistant knowledge.
      These files can be retrieved or processed by function calls referring to their id.
      Here is the assistant knowledge:
      ${JSON.stringify(knowledge)}
      When the user requests to gather information from unspecified files, he's referring to files attached in the same message, so **do not mention / use the knowledge if it's not useful to answer the user question**.
      `
    segments[0] = {
      scope: 'prompt',
      message: {
        ...systemPromptMessage,
        content: `${systemPromptMessage.content}${knowledgePrompt}`,
      },
    }
    const knowledgePlugin = resolvedTools.find((t) => t instanceof KnowledgePlugin)
    if (knowledgePlugin) {
      const parts = await Promise.all(
        knowledge.map((k) =>
          (knowledgePlugin as InstanceType<typeof KnowledgePlugin>).knowledgeToInputPart(k, llmModel)
        )
      )
      const analysisFileIds = parts.flatMap((part, index) =>
        part.type === 'file' ? [knowledge[index]?.id ?? ''] : []
      ).filter((id) => id.length > 0)
      const knowledgeFileEntries: KnowledgeFileEntry[] = knowledge.map((k, index) => ({
        fileId: k.id,
        fileName: k.name,
        partIndex: index,
      }))
      segments.push({
        scope: 'prompt',
        message: { role: 'user', content: parts },
        analysisFileIds,
        knowledgeFileEntries,
      })
    }
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
            (await dtoMessageToLlmMessage(message, llmModel.capabilities, languageModel)) ??
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

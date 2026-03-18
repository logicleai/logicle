import * as ai from 'ai'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import { LlmModel } from '@/lib/chat/models'
import { ToolImplementation } from '@/lib/chat/tools'
import type { ParameterValueAndDescription } from '@/models/user'

type AssistantParamsLike = {
  systemPrompt: string
}

export type PromptSegment = {
  scope: 'prompt' | 'history' | 'draft'
  message: ai.ModelMessage
  analysisFileIds?: string[]
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
  const { KnowledgePlugin } = await import('@/lib/tools/knowledge/implementation')
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
  const { KnowledgePlugin } = await import('@/lib/tools/knowledge/implementation')
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
      segments.push({
        scope: 'prompt',
        message: { role: 'user', content: parts },
        analysisFileIds,
      })
    }
  }

  return segments
}

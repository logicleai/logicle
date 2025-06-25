import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider'
import { OpenAIResponsesTool } from './openai-responses-api-types'

export function prepareResponsesTools({
  tools,
  toolChoice,
  strict,
}: {
  tools: LanguageModelV2CallOptions['tools']
  toolChoice?: LanguageModelV2CallOptions['toolChoice']
  strict: boolean
}): {
  tools?: Array<OpenAIResponsesTool>
  toolChoice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'web_search_preview' }
    | { type: 'function'; name: string }
  toolWarnings: LanguageModelV2CallWarning[]
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined

  const toolWarnings: LanguageModelV2CallWarning[] = []

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings }
  }

  const openaiTools: Array<OpenAIResponsesTool> = []

  for (const tool of tools) {
    switch (tool.type) {
      case 'function':
        openaiTools.push({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: strict ? true : undefined,
        })
        break
      case 'provider-defined':
        {
          const { id, name, type, args } = tool
          if (tool.id.startsWith('openai.')) {
            // remove the `openai.` prefix to get the tool type
            const type = id.slice('openai.'.length)
            openaiTools.push({
              type,
              ...args,
            })
          } else {
            // fallback for non-OpenAI tools
            toolWarnings.push({ type: 'unsupported-tool', tool })
          }
        }
        break
      default:
        toolWarnings.push({ type: 'unsupported-tool', tool })
        break
    }
  }

  if (toolChoice == null) {
    return { tools: openaiTools, toolChoice: undefined, toolWarnings }
  }

  const type = toolChoice.type

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: openaiTools, toolChoice: type, toolWarnings }
    case 'tool':
      return {
        tools: openaiTools,
        toolChoice:
          toolChoice.toolName === 'web_search_preview'
            ? { type: 'web_search_preview' }
            : { type: 'function', name: toolChoice.toolName },
        toolWarnings,
      }
    default: {
      const _exhaustiveCheck: never = type
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      })
    }
  }
}

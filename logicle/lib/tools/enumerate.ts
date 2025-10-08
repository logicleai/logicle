import { assistantVersionTools } from '@/models/assistant'
import { ToolBuilder, ToolImplementation } from '@/lib/chat/tools'
import { TimeOfDay } from './timeofday/implementation'
import { getToolsFiltered, getBuildableTools, BuildableTool } from '@/models/tool'
import { OpenApiPlugin } from './openapi/implementation'
import { FileManagerPlugin } from './retrieve-file/implementation'
import { Dall_ePlugin } from './dall-e/implementation'
import { McpPlugin } from './mcp/implementation'
import { WebSearch } from './websearch/implementation'
import { NativeTool } from './nativetool/implementation'
import { ProviderOptionsTool } from './providerOptions/implementation'
import { AnthropicWebSearch } from './anthropic.web_search/implementation'
import { GoogleWebSearch } from './google.web_search/implementation'
import { OpenaiWebSearch } from './openai.web_search/implementation'
import { Router } from './router/implementation'
import { OpenaiCodeInterpreter } from './openai.code_interpreter/implementation'
import { OpenaiImageGeneration } from './openai.image_generation/implementation'
import { DummyTool } from './dummy/implementation'

const builders: Record<string, ToolBuilder> = {
  [Dall_ePlugin.toolName]: Dall_ePlugin.builder,
  [FileManagerPlugin.toolName]: FileManagerPlugin.builder,
  [OpenApiPlugin.toolName]: OpenApiPlugin.builder,
  [McpPlugin.toolName]: McpPlugin.builder,
  [NativeTool.toolName]: NativeTool.builder,
  [ProviderOptionsTool.toolName]: ProviderOptionsTool.builder,
  [Router.toolName]: Router.builder,
  [TimeOfDay.toolName]: TimeOfDay.builder,
  [WebSearch.toolName]: WebSearch.builder,
  [DummyTool.toolName]: DummyTool.builder,

  // Provider specific tools
  [AnthropicWebSearch.toolName]: AnthropicWebSearch.builder,
  [OpenaiWebSearch.toolName]: OpenaiWebSearch.builder,
  [GoogleWebSearch.toolName]: GoogleWebSearch.builder,
  [OpenaiCodeInterpreter.toolName]: OpenaiCodeInterpreter.builder,
  [OpenaiImageGeneration.toolName]: OpenaiImageGeneration.builder,
}

export const buildTool = async (
  tool: BuildableTool,
  model: string
): Promise<ToolImplementation | undefined> => {
  const builder = builders[tool.type]
  return await builder?.(tool, tool.configuration, model)
}

export const availableTools = async (model: string) => {
  const tools = await getBuildableTools()
  return (
    await Promise.all(
      tools.map((t) => {
        return buildTool(t, model)
      })
    )
  ).filter((t) => !(t === undefined)) as ToolImplementation[]
}

export const availableToolsForAssistantVersion = async (
  assistantVersionId: string,
  model: string
) => {
  const tools = await assistantVersionTools(assistantVersionId)
  const implementations = (
    await Promise.all(
      tools.map((t) => {
        return buildTool(t, model)
      })
    )
  ).filter((t) => !(t === undefined)) as ToolImplementation[]
  return implementations
}

export const availableToolsFiltered = async (ids: string[], model: string) => {
  const tools = await getToolsFiltered(ids)
  const implementations = (
    await Promise.all(
      tools.map((t) => {
        return buildTool(t, model)
      })
    )
  ).filter((t) => t !== undefined) as ToolImplementation[]
  return implementations
}

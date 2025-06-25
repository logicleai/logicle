import { assistantVersionTools } from '@/models/assistant'
import { ToolImplementation } from '@/lib/chat/tools'
import { TimeOfDay } from './timeofday/implementation'
import { getTools, getToolsFiltered } from '@/models/tool'
import * as dto from '@/types/dto'
import { OpenApiPlugin } from './openapi/implementation'
import { FileManagerPlugin } from './retrieve-file/implementation'
import { Dall_ePlugin } from './dall-e/implementation'
import { McpPlugin } from './mcp/implementation'
import { WebSearch } from './websearch/implementation'
import { NativeTool } from './nativetool/implementation'
import { Router } from './router/implementation'
import { ProviderOptionsTool } from './providerOptions/implementation'

export const buildToolImplementationFromDbInfo = async (
  tool: dto.Tool,
  model: string
): Promise<ToolImplementation | undefined> => {
  const args = {
    provisioned: tool.provisioned ? true : false,
    promptFragment: tool.promptFragment,
  }
  if (tool.type == TimeOfDay.toolName) {
    return await TimeOfDay.builder(args, tool.configuration, model)
  } else if (tool.type == OpenApiPlugin.toolName) {
    return await OpenApiPlugin.builder(args, tool.configuration, model)
  } else if (tool.type == McpPlugin.toolName) {
    return await McpPlugin.builder(args, tool.configuration, model)
  } else if (tool.type == FileManagerPlugin.toolName) {
    return await FileManagerPlugin.builder(args, tool.configuration, model)
  } else if (tool.type == Dall_ePlugin.toolName) {
    return await Dall_ePlugin.builder(args, tool.configuration, model)
  } else if (tool.type == WebSearch.toolName) {
    return await WebSearch.builder(args, tool.configuration, model)
  } else if (tool.type == NativeTool.toolName) {
    return await NativeTool.builder(args, tool.configuration, model)
  } else if (tool.type == Router.toolName) {
    return await Router.builder(args, tool.configuration, model)
  } else if (tool.type == ProviderOptionsTool.toolName) {
    return await ProviderOptionsTool.builder(args, tool.configuration, model)
  } else {
    return undefined
  }
}

export const availableTools = async (model: string) => {
  const tools = await getTools()
  return (
    await Promise.all(
      tools.map((t) => {
        return buildToolImplementationFromDbInfo(t, model)
      })
    )
  ).filter((t) => !(t == undefined)) as ToolImplementation[]
}

export const availableToolsForAssistantVersion = async (
  assistantVersionId: string,
  model: string
) => {
  const tools = await assistantVersionTools(assistantVersionId)
  const implementations = (
    await Promise.all(
      tools.map((t) => {
        return buildToolImplementationFromDbInfo(t, model)
      })
    )
  ).filter((t) => !(t == undefined)) as ToolImplementation[]
  return implementations
}

export const availableToolsFiltered = async (ids: string[], model: string) => {
  const tools = await getToolsFiltered(ids)
  const implementations = (
    await Promise.all(
      tools.map((t) => {
        return buildToolImplementationFromDbInfo(t, model)
      })
    )
  ).filter((t) => t !== undefined) as ToolImplementation[]
  return implementations
}

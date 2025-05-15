import { assistantVersionTools } from '@/models/assistant'
import { ToolImplementation } from '@/lib/chat/tools'
import { TimeOfDay } from './timeofday/implementation'
import { getTools, getToolsFiltered } from '@/models/tool'
import * as dto from '@/types/dto'
import { OpenApiPlugin } from './openapi/implementation'
import { FileManagerPlugin } from './retrieve-file/implementation'
import { Dall_ePlugin } from './dall-e/implementation'
import { McpPlugin } from './mcp/implementation'
import { WebSearchInterface } from './websearch/interface'
import { WebSearch } from './websearch/implementation'

export const buildToolImplementationFromDbInfo = async (
  tool: dto.ToolDTO
): Promise<ToolImplementation | undefined> => {
  const provisioned = tool.provisioned ? true : false
  if (tool.type == TimeOfDay.toolName) {
    return await TimeOfDay.builder(tool.configuration, provisioned)
  } else if (tool.type == OpenApiPlugin.toolName) {
    return await OpenApiPlugin.builder(tool.configuration, provisioned)
  } else if (tool.type == McpPlugin.toolName) {
    return await McpPlugin.builder(tool.configuration, provisioned)
  } else if (tool.type == FileManagerPlugin.toolName) {
    return await FileManagerPlugin.builder(tool.configuration, provisioned)
  } else if (tool.type == Dall_ePlugin.toolName) {
    return await Dall_ePlugin.builder(tool.configuration, provisioned)
  } else if (tool.type == WebSearch.toolName) {
    return await WebSearch.builder(tool.configuration, provisioned)
  } else {
    return undefined
  }
}

export const availableTools = async () => {
  const tools = await getTools()
  return (
    await Promise.all(
      tools.map((t) => {
        return buildToolImplementationFromDbInfo(t)
      })
    )
  ).filter((t) => !(t == undefined)) as ToolImplementation[]
}

export const availableToolsForAssistantVersion = async (assistantVersionId: string) => {
  const tools = await assistantVersionTools(assistantVersionId)
  const implementations = (
    await Promise.all(
      tools.map((t) => {
        return buildToolImplementationFromDbInfo(t)
      })
    )
  ).filter((t) => !(t == undefined)) as ToolImplementation[]
  return implementations
}

export const availableToolsFiltered = async (ids: string[]) => {
  const tools = await getToolsFiltered(ids)
  const implementations = (
    await Promise.all(
      tools.map((t) => {
        return buildToolImplementationFromDbInfo(t)
      })
    )
  ).filter((t) => t !== undefined) as ToolImplementation[]
  return implementations
}

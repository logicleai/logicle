import Assistants from '@/models/assistant'
import { ToolImplementation } from '@/lib/chat/tools'
import { ChatGptRetrievalPlugin } from './chatgpt-retrieval-plugin/implementation'
import { TimeOfDay } from './timeofday/implementation'
import { getTools, getToolsFiltered } from '@/models/tool'
import * as dto from '@/types/dto'
import { OpenApiPlugin } from './openapi/implementation'
import { FileManagerPlugin } from './retrieve-file/implementation'

export const buildToolImplementationFromDbInfo = async (
  tool: dto.ToolDTO
): Promise<ToolImplementation | undefined> => {
  if (tool.type == ChatGptRetrievalPlugin.toolName) {
    return await ChatGptRetrievalPlugin.builder({
      ...tool.configuration,
    })
  } else if (tool.type == TimeOfDay.toolName) {
    return await TimeOfDay.builder(tool.configuration)
  } else if (tool.type == OpenApiPlugin.toolName) {
    return await OpenApiPlugin.builder(tool.configuration)
  } else if (tool.type == FileManagerPlugin.toolName) {
    return await FileManagerPlugin.builder(tool.configuration)
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

export const availableToolsForAssistant = async (assistantId: string) => {
  const tools = await Assistants.tools(assistantId)
  return (
    await Promise.all(
      tools.map((t) => {
        return buildToolImplementationFromDbInfo(t)
      })
    )
  ).filter((t) => !(t == undefined)) as ToolImplementation[]
}

export const availableToolsFiltered = async (ids: string[]) => {
  const tools = await getToolsFiltered(ids)
  return (
    await Promise.all(
      tools.map((t) => {
        return buildToolImplementationFromDbInfo(t)
      })
    )
  ).filter((t) => t !== undefined) as ToolImplementation[]
}

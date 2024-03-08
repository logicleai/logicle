import Assistants from 'models/assistant'
import { ToolImplementation } from '../openai'
import { ChatGptRetrievalPlugin } from './chatgpt-retrieval-plugin/implementation'
import { TimeOfDay } from './timeofday/implementation'
import { getTools, getToolsFiltered } from 'models/tool'
import { ToolDTO } from '@/types/dto'

export const buildToolImplementationFromDbInfo = (
  tool: ToolDTO
): ToolImplementation | undefined => {
  if (tool.type == ChatGptRetrievalPlugin.toolName) {
    return ChatGptRetrievalPlugin.builder({
      ...tool.configuration,
    })
  } else if (tool.type == TimeOfDay.toolName) {
    return TimeOfDay.builder(tool.configuration)
  } else {
    return undefined
  }
}

export const availableTools = async () => {
  const tools = await getTools()
  return tools
    .map((t) => {
      return buildToolImplementationFromDbInfo(t)
    })
    .filter((t) => !(t == undefined)) as ToolImplementation[]
}

export const availableToolsForAssistant = async (assistantId: string) => {
  const tools = await Assistants.tools(assistantId)
  return tools
    .map((t) => {
      return buildToolImplementationFromDbInfo(t)
    })
    .filter((t) => !(t == undefined)) as ToolImplementation[]
}

export const availableToolsFiltered = async (ids: string[]) => {
  const tools = await getToolsFiltered(ids)
  return tools
    .map((t) => {
      return buildToolImplementationFromDbInfo(t)
    })
    .filter((t) => t !== undefined) as ToolImplementation[]
}

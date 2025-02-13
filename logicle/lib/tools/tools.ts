import { ChatGptRetrievalPluginInterface } from './chatgpt-retrieval-plugin/interface'
import { Dall_ePluginInterface } from './dall-e/interface'
import { OpenApiInterface } from './openapi/interface'
import { FileManagerPluginInterface } from './retrieve-file/interface'
import { TimeOfDayInterface } from './timeofday/interface'

export const toolNames = [
  Dall_ePluginInterface.toolName,
  ChatGptRetrievalPluginInterface.toolName,
  OpenApiInterface.toolName,
  FileManagerPluginInterface.toolName,
  TimeOfDayInterface.toolName,
]
export type ToolType = (typeof toolNames)[number]

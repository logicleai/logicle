import { Dall_ePluginInterface } from './dall-e/interface'
import { OpenApiInterface } from './openapi/interface'
import { FileManagerPluginInterface } from './retrieve-file/interface'
import { TimeOfDayInterface } from './timeofday/interface'
import { WebSearchInterface } from './websearch/interface'

export const toolNames = [
  Dall_ePluginInterface.toolName,
  OpenApiInterface.toolName,
  FileManagerPluginInterface.toolName,
  TimeOfDayInterface.toolName,
  WebSearchInterface.toolName,
]
export type ToolType = (typeof toolNames)[number]

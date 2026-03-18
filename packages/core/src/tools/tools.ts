import {
  FileManagerPluginInterface,
  ImageGeneratorPluginInterface,
  OpenApiInterface,
  TimeOfDayInterface,
  WebSearchInterface,
} from './schemas'

export const toolNames = [
  ImageGeneratorPluginInterface.toolName,
  OpenApiInterface.toolName,
  FileManagerPluginInterface.toolName,
  TimeOfDayInterface.toolName,
  WebSearchInterface.toolName,
]
export type ToolType = (typeof toolNames)[number]

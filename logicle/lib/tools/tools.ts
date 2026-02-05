import { ImageGeneratorPluginInterface } from './imagegenerator/interface'
import { OpenApiInterface } from './openapi/interface'
import { FileManagerPluginInterface } from './retrieve-file/interface'
import { TimeOfDayInterface } from './timeofday/interface'
import { WebSearchInterface } from './websearch/interface'
import { IsolatedVmInterface } from './isolated-vm/interface'

export const toolNames = [
  ImageGeneratorPluginInterface.toolName,
  OpenApiInterface.toolName,
  FileManagerPluginInterface.toolName,
  TimeOfDayInterface.toolName,
  WebSearchInterface.toolName,
  IsolatedVmInterface.toolName,
]
export type ToolType = (typeof toolNames)[number]
